import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { safeZipName, zipStream, type ZipEntry } from "./zip";

/**
 * These tests read the archive back rather than asserting on the bytes that were just
 * written. Checking that byte 14 holds the CRC proves only that the writer agrees with
 * itself; parsing the central directory the way an unzip tool does is what catches an
 * offset that is four bytes out.
 */

async function build(entries: ZipEntry[]): Promise<Buffer> {
  async function* iterate() {
    for (const entry of entries) yield entry;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of zipStream(iterate())) chunks.push(chunk);
  return Buffer.concat(chunks);
}

interface ReadEntry {
  name: string;
  body: Buffer;
}

/** A deliberately independent reader: finds the directory, then follows its offsets. */
function readZip(zip: Buffer): ReadEntry[] {
  // The end record is the last 22 bytes when there is no comment, which is our case.
  const eocd = zip.length - 22;
  expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);

  const count = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);

  const out: ReadEntry[] = [];

  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);

    const crc = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLen = zip.readUInt16LE(cursor + 28);
    const extraLen = zip.readUInt16LE(cursor + 30);
    const commentLen = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf8");

    // Follow the offset to the local header and take the data that sits behind it.
    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localNameLen = zip.readUInt16LE(localOffset + 26);
    const localExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const body = zip.subarray(dataStart, dataStart + size);

    // The archive has to be internally consistent, not merely parseable.
    expect(zip.subarray(localOffset + 30, localOffset + 30 + localNameLen).toString("utf8")).toBe(
      name,
    );
    expect(crc32(body) >>> 0).toBe(crc);

    out.push({ name, body: Buffer.from(body) });
    cursor += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

describe("zipStream", () => {
  it("round-trips a single file", async () => {
    const zip = await build([
      { name: "report.pdf", body: async () => Buffer.from("%PDF-1.4 hello") },
    ]);

    const read = readZip(zip);
    expect(read).toHaveLength(1);
    expect(read[0].name).toBe("report.pdf");
    expect(read[0].body.toString()).toBe("%PDF-1.4 hello");
  });

  it("round-trips several files, in order", async () => {
    const entries = ["a", "b", "c"].map((n) => ({
      name: `${n}.pdf`,
      body: async () => Buffer.from(`contents of ${n}`.repeat(100)),
    }));

    const read = readZip(await build(entries));
    expect(read.map((e) => e.name)).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
    expect(read[2].body.toString()).toBe("contents of c".repeat(100));
  });

  it("produces a valid archive with no entries at all", async () => {
    // Every participant skipped this challenge. The export must still open rather than
    // handing somebody a corrupt file to puzzle over.
    const zip = await build([]);
    expect(readZip(zip)).toEqual([]);
    expect(zip.length).toBe(22);
  });

  it("handles a file that is entirely empty", async () => {
    const read = readZip(await build([{ name: "empty.pdf", body: async () => Buffer.alloc(0) }]));
    expect(read[0].body.length).toBe(0);
  });

  it("reads each body only when its turn comes", async () => {
    // The whole point of the design: five hundred reports must not be in memory at
    // once. If this ever regresses to eager reads, the VM finds out before the judge.
    const order: string[] = [];

    const entries: ZipEntry[] = ["one", "two", "three"].map((n) => ({
      name: `${n}.pdf`,
      body: async () => {
        order.push(n);
        return Buffer.from(n);
      },
    }));

    async function* iterate() {
      for (const entry of entries) {
        expect(order).toHaveLength(entries.indexOf(entry));
        yield entry;
      }
    }

    const chunks: Buffer[] = [];
    for await (const chunk of zipStream(iterate())) chunks.push(chunk);

    expect(order).toEqual(["one", "two", "three"]);
  });

  it("keeps non-ASCII names intact", async () => {
    const read = readZip(
      await build([{ name: "Ayesha Khan — report.pdf", body: async () => Buffer.from("x") }]),
    );
    expect(read[0].name).toBe("Ayesha Khan — report.pdf");
  });

  it("marks names as UTF-8 so tools do not mangle them", async () => {
    const zip = await build([{ name: "naïve.pdf", body: async () => Buffer.from("x") }]);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
  });

  it("stores rather than deflating, because the input is already compressed", async () => {
    const zip = await build([{ name: "a.pdf", body: async () => Buffer.from("x".repeat(500)) }]);
    expect(zip.readUInt16LE(8)).toBe(0);
    // Stored means the two size fields agree.
    expect(zip.readUInt32LE(18)).toBe(500);
    expect(zip.readUInt32LE(22)).toBe(500);
  });
});

describe("safeZipName", () => {
  it("leaves an ordinary name alone", () => {
    expect(safeZipName("12345-AyeshaKhan-Challenge-2.pdf")).toBe(
      "12345-AyeshaKhan-Challenge-2.pdf",
    );
  });

  it("cannot be made to escape the archive", () => {
    // The name is built from a participant's own full name, so this is not theoretical.
    expect(safeZipName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeZipName("..\\..\\windows\\system32")).toBe("windows-system32");
    expect(safeZipName("/absolute/path.pdf")).toBe("absolute-path.pdf");
  });

  it("replaces the characters Windows refuses", () => {
    expect(safeZipName('a<b>c:d"e|f?g*h.pdf')).toBe("a_b_c_d_e_f_g_h.pdf");
  });

  it("strips control characters", () => {
    expect(safeZipName("name\u0000with\u001fcontrol.pdf")).toBe("namewithcontrol.pdf");
  });

  it("never returns an empty name", () => {
    expect(safeZipName("")).toBe("file");
    expect(safeZipName("...")).toBe("file");
    expect(safeZipName("   ")).toBe("file");
  });

  it("caps the length, because some filesystems will not take more", () => {
    expect(safeZipName("x".repeat(400)).length).toBe(180);
  });
});

describe("ZIP64", () => {
  it("switches to the 64-bit end record once the classic one cannot count the entries", async () => {
    // The classic end-of-directory record holds the entry count in sixteen bits. Five
    // hundred participants will never reach that, but the branch that handles it is
    // also the branch that handles an archive past four gigabytes — which they can
    // reach — and an untested branch there produces a file nobody can open.
    const count = 70_000;

    async function* many() {
      for (let i = 0; i < count; i++) {
        yield { name: `f${i}.pdf`, body: async () => Buffer.from("x") };
      }
    }

    const chunks: Buffer[] = [];
    for await (const chunk of zipStream(many())) chunks.push(chunk);
    const zip = Buffer.concat(chunks);

    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);

    // The classic record saturates and defers to the 64-bit one.
    expect(zip.readUInt16LE(eocd + 10)).toBe(0xffff);

    const locator = eocd - 20;
    expect(zip.readUInt32LE(locator)).toBe(0x07064b50);

    const zip64 = Number(zip.readBigUInt64LE(locator + 8));
    expect(zip.readUInt32LE(zip64)).toBe(0x06064b50);
    expect(Number(zip.readBigUInt64LE(zip64 + 32))).toBe(count);
  }, 60_000);
});
