import { crc32 } from "node:zlib";

/**
 * A streaming ZIP writer, in about two hundred lines and no dependencies.
 *
 * Written rather than installed for two reasons. The obvious one is that an
 * application a security team has already scanned does not want ten new transitive
 * packages for one admin button. The less obvious one is that the alternative
 * libraries all want to own the output stream, and what this needs is the opposite:
 * yield bytes as they are ready, so a judge downloading five hundred reports never has
 * more than one of them in memory at a time.
 *
 * **Entries are stored, not deflated.** Every file going through here is a PDF, which
 * is already compressed — deflating it again would cost CPU on a shared VM to make the
 * archive fractionally larger. Storing also means the sizes are known before the
 * header is written, so no data descriptors are needed and the format stays simple.
 *
 * **ZIP64 is handled.** Five hundred reports at twenty megabytes each is ten
 * gigabytes, and past four the classic end-of-directory record cannot hold the
 * offsets. Individual files never approach that limit, so only the offsets and the
 * trailing records ever need the 64-bit form, and they take it only when they must —
 * an archive that fits in the classic format is written in the classic format, because
 * that is the one every tool can read.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;

/** Flag bit 11: the name is UTF-8 rather than the ancient code page. */
const UTF8_FLAG = 0x0800;
const STORED = 0;

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

export interface ZipEntry {
  /** Path inside the archive. Sanitised by `safeZipName` before use. */
  name: string;
  /**
   * The bytes, fetched only when this entry's turn comes.
   *
   * A function rather than a Buffer so the caller can read each file from storage as
   * it is written. Handing this an array of Buffers would mean holding every report in
   * memory at once, which is the thing this design exists to avoid.
   */
  body: () => Promise<Buffer>;
}

interface Placed {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
}

/**
 * Yields a complete ZIP archive for the given entries.
 *
 * Entries arrive as an async iterable so the caller can produce them lazily — one
 * database row and one storage read at a time.
 */
export async function* zipStream(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Buffer> {
  const placed: Placed[] = [];
  const stamp = dosTimestamp(new Date());
  let offset = 0;

  for await (const entry of entries) {
    const name = Buffer.from(safeZipName(entry.name), "utf8");
    const body = await entry.body();
    const crc = crc32(body) >>> 0;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIG, 0);
    header.writeUInt16LE(20, 4); // version needed: 2.0 is all that stored entries require
    header.writeUInt16LE(UTF8_FLAG, 6);
    header.writeUInt16LE(STORED, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    yield header;
    yield name;
    yield body;

    placed.push({ name, crc, size: body.length, offset });
    offset += header.length + name.length + body.length;
  }

  // ---- central directory ----
  const directoryOffset = offset;
  let directorySize = 0;

  for (const file of placed) {
    // Only the offset can overflow: a single stored file would have to exceed 4GB for
    // the size fields to need the 64-bit form, and these are PDFs.
    const needsZip64 = file.offset > U32_MAX;
    const extra = needsZip64 ? zip64ExtraForOffset(file.offset) : Buffer.alloc(0);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(CENTRAL_SIG, 0);
    record.writeUInt16LE(20, 4); // version made by
    record.writeUInt16LE(needsZip64 ? 45 : 20, 6); // version needed
    record.writeUInt16LE(UTF8_FLAG, 8);
    record.writeUInt16LE(STORED, 10);
    record.writeUInt16LE(stamp.time, 12);
    record.writeUInt16LE(stamp.date, 14);
    record.writeUInt32LE(file.crc, 16);
    record.writeUInt32LE(file.size, 20);
    record.writeUInt32LE(file.size, 24);
    record.writeUInt16LE(file.name.length, 28);
    record.writeUInt16LE(extra.length, 30);
    record.writeUInt16LE(0, 32); // comment length
    record.writeUInt16LE(0, 34); // disk number
    record.writeUInt16LE(0, 36); // internal attributes
    record.writeUInt32LE(0, 38); // external attributes
    record.writeUInt32LE(needsZip64 ? U32_MAX : file.offset, 42);

    yield record;
    yield file.name;
    if (extra.length) yield extra;

    directorySize += record.length + file.name.length + extra.length;
  }

  // ---- end of central directory ----
  const needsZip64End =
    placed.length > U16_MAX || directoryOffset > U32_MAX || directorySize > U32_MAX;

  if (needsZip64End) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(ZIP64_EOCD_SIG, 0);
    // Size of this record, counting everything after this 8-byte field.
    record.writeBigUInt64LE(BigInt(44), 4);
    record.writeUInt16LE(45, 12); // version made by
    record.writeUInt16LE(45, 14); // version needed
    record.writeUInt32LE(0, 16); // this disk
    record.writeUInt32LE(0, 20); // disk holding the directory
    record.writeBigUInt64LE(BigInt(placed.length), 24);
    record.writeBigUInt64LE(BigInt(placed.length), 32);
    record.writeBigUInt64LE(BigInt(directorySize), 40);
    record.writeBigUInt64LE(BigInt(directoryOffset), 48);
    yield record;

    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(ZIP64_LOCATOR_SIG, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(directoryOffset + directorySize), 8);
    locator.writeUInt32LE(1, 16); // total disks
    yield locator;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD_SIG, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Math.min(placed.length, U16_MAX), 8);
  end.writeUInt16LE(Math.min(placed.length, U16_MAX), 10);
  end.writeUInt32LE(Math.min(directorySize, U32_MAX), 12);
  end.writeUInt32LE(Math.min(directoryOffset, U32_MAX), 16);
  end.writeUInt16LE(0, 20); // comment length
  yield end;
}

/** The ZIP64 extra field carrying a local-header offset that will not fit in 32 bits. */
function zip64ExtraForOffset(offset: number): Buffer {
  const extra = Buffer.alloc(12);
  extra.writeUInt16LE(0x0001, 0); // header id
  extra.writeUInt16LE(8, 2); // payload size
  extra.writeBigUInt64LE(BigInt(offset), 4);
  return extra;
}

/**
 * MS-DOS time and date, which is what ZIP has recorded since 1989 and still does.
 *
 * Two-second resolution and an epoch of 1980. Nothing here depends on the timestamp
 * being exact; it exists so that extracted files do not land with a 1980 date.
 */
function dosTimestamp(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/**
 * A filename safe to put inside an archive.
 *
 * The names here are built from a participant's own full name, so this is not
 * theoretical: a name containing a slash, or the characters Windows refuses, would
 * produce an archive that extracts somewhere unexpected or not at all. Everything
 * outside a conservative set becomes an underscore, and leading dots and separators go
 * entirely — `../../etc/passwd` must not survive in any form.
 */
export function safeZipName(name: string): string {
  const cleaned = name
    // Both separators, so a Windows path is flattened as thoroughly as a POSIX one.
    .replace(/[\\/]+/g, "-")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    // Any run of two or more dots, wherever it sits. Leaving a stray ".." in the
    // middle of a flattened path is harmless but looks like a bug in the export.
    .replace(/\.{2,}/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-.\s]+/, "")
    .replace(/[-.\s]+$/, "")
    .slice(0, 180);

  return cleaned || "file";
}

/** Turns the generator into the stream a Response body wants. */
export function zipResponseStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const chunks = zipStream(entries);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(new Uint8Array(value));
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      // The judge navigated away or cancelled the download. Stop reading files.
      void chunks.return(undefined);
    },
  });
}
