import { describe, expect, it } from "vitest";
import {
  derivePassword,
  firstNameOf,
  lastFiveDigits,
  mapHeaders,
  parseCsv,
  parseJudges,
  parseParticipants,
  problemsToCsv,
} from "./bulk-import";

const participantCsv = (body: string) => "fullName,email,phone,cnic,location\n" + body;
const judgeCsv = (body: string) => "fullName,email,phone\n" + body;

describe("parseCsv", () => {
  it("reads a plain file", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    // The failure this guards against is silent: a name like "Khan, Ayesha" would
    // otherwise shift every later column by one and the CNIC would land in `phone`.
    expect(parseCsv('name,city\n"Khan, Ayesha",Karachi\n')).toEqual([
      ["name", "city"],
      ["Khan, Ayesha", "Karachi"],
    ]);
  });

  it("understands doubled quotes", () => {
    expect(parseCsv('a\n"she said ""hi"""\n')).toEqual([["a"], ['she said "hi"']]);
  });

  it("handles CRLF as well as LF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a byte-order mark so the first header still matches", () => {
    expect(parseCsv("﻿fullName,email\nx,y\n")[0][0]).toBe("fullName");
  });

  it("skips blank lines rather than treating them as rows", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toHaveLength(2);
  });

  it("reads a final line with no trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toHaveLength(2);
  });
});

describe("mapHeaders", () => {
  it("accepts the spellings people actually type", () => {
    const mapped = mapHeaders(["Full Name", "E-mail", "Mobile Number", "ID Card Number", "City"]);
    expect(mapped).toEqual({ fullName: 0, email: 1, phone: 2, cnic: 3, location: 4 });
  });

  it("does not care about column order", () => {
    const mapped = mapHeaders(["cnic", "location", "email", "phone", "fullName"]);
    expect(mapped.cnic).toBe(0);
    expect(mapped.fullName).toBe(4);
  });
});

describe("the password rule", () => {
  it("is the first name followed by the last five digits", () => {
    expect(derivePassword("Ayesha Khan", "42101-1234567-1")).toBe("Ayesha45671");
  });

  it("takes only the first word of the name", () => {
    expect(firstNameOf("Syeda Fatima Noor Sheikh")).toBe("Syeda");
  });

  it("drops punctuation, so a surname-first row does not produce a comma", () => {
    // "Sheikh, Fatima" in a spreadsheet would otherwise give the password
    // "Sheikh,12345" — derivable, but unpleasant to read out and easy to mistype.
    expect(firstNameOf("Sheikh, Fatima")).toBe("Sheikh");
    expect(derivePassword("Sheikh, Fatima", "3520112345672")).toBe("Sheikh45672");
  });

  it("keeps letters from other scripts", () => {
    expect(firstNameOf("Aíza Malik")).toBe("Aíza");
  });

  it("ignores punctuation in the number it draws digits from", () => {
    expect(lastFiveDigits("+92 300 1234567")).toBe("34567");
    expect(lastFiveDigits("42101-1234567-8")).toBe("45678");
  });

  it("produces a short password rather than refusing a short name", () => {
    // "Ali" + five digits is eight characters, under the ten a person choosing their
    // own would face. Accepted deliberately: the rule's whole value is that the
    // participant can work it out, and padding it would destroy that.
    expect(derivePassword("Ali Raza", "4210112345671")).toBe("Ali45671");
  });

  it("is reproducible, which is what lets the console show it without storing it", () => {
    const first = derivePassword("Zainab Tariq", "61101-1234567-3");
    const second = derivePassword("Zainab Tariq", "6110112345673");
    expect(first).toBe(second);
  });
});

describe("parseParticipants", () => {
  it("accepts a good row and derives its password", () => {
    const { rows, problems } = parseParticipants(
      participantCsv("Ayesha Khan,ayesha@example.com,0300-1234561,42101-1234567-1,Karachi\n"),
    );

    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fullName: "Ayesha Khan",
      email: "ayesha@example.com",
      phone: "+923001234561",
      idCardNumber: "4210112345671",
      location: "KARACHI",
      password: "Ayesha45671",
    });
  });

  it("reports a bad row and keeps the good ones", () => {
    // The governing requirement: one bad row must not stop the import.
    const { rows, problems } = parseParticipants(
      participantCsv(
        "Ayesha Khan,ayesha@example.com,0300-1234561,42101-1234567-1,Karachi\n" +
          "Broken Row,not-an-email,123,42101-1234567-2,Karachi\n" +
          "Fatima Sheikh,fatima@example.com,0300-1234563,35201-1234567-3,Lahore\n",
      ),
    );

    expect(rows).toHaveLength(2);
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(3);
  });

  it("names the field that is wrong, in words", () => {
    const { problems } = parseParticipants(
      participantCsv("Ayesha Khan,ayesha@example.com,12,42101-1234567-1,Karachi\n"),
    );

    expect(problems[0].problems).toEqual(["Enter a valid Pakistani mobile number"]);
  });

  it("collects every fault in a row at once", () => {
    // Being told one fault per upload turns a correction into several round trips.
    const { problems } = parseParticipants(participantCsv("Ayesha Khan,bad,12,123,Atlantis\n"));
    expect(problems[0].problems.length).toBeGreaterThanOrEqual(3);
  });

  it("says which field is missing when a cell is blank", () => {
    const { problems } = parseParticipants(
      participantCsv("Ayesha Khan,ayesha@example.com,,42101-1234567-1,Karachi\n"),
    );
    expect(problems[0].problems).toEqual(["Phone number is missing"]);
  });

  it("catches a person listed twice in the same file", () => {
    const { rows, problems } = parseParticipants(
      participantCsv(
        "Ayesha Khan,ayesha@example.com,0300-1234561,42101-1234567-1,Karachi\n" +
          "Ayesha Khan,ayesha@example.com,0300-1234562,42101-1234567-2,Karachi\n",
      ),
    );

    expect(rows).toHaveLength(1);
    expect(problems[0].problems.join(" ")).toMatch(/appears earlier in the file/i);
  });

  it("refuses a file whose columns it cannot find, rather than guessing", () => {
    const { missingColumns, rows } = parseParticipants("name,email\nAyesha,a@b.com\n");
    expect(rows).toEqual([]);
    expect(missingColumns).toContain("phone");
    expect(missingColumns).toContain("cnic");
  });

  it("counts every data row, including the rejected ones", () => {
    const { totalDataRows } = parseParticipants(
      participantCsv("Good Person,g@example.com,0300-1234561,42101-1234567-1,Karachi\nBad,x,y,z,w\n"),
    );
    expect(totalDataRows).toBe(2);
  });
});

describe("parseJudges", () => {
  it("derives a judge's password from their phone number", () => {
    const { rows } = parseJudges(judgeCsv("Nadia Rehman,nadia@10pearls.com,0300-1111111\n"));
    expect(rows[0]).toMatchObject({ password: "Nadia11111", phone: "+923001111111" });
  });

  it("insists on the 10Pearls domain", () => {
    const { rows, problems } = parseJudges(judgeCsv("Outside Person,someone@gmail.com,0300-1111111\n"));
    expect(rows).toEqual([]);
    expect(problems[0].problems.join(" ")).toMatch(/@10pearls\.com/);
  });

  it("does not ask for a CNIC or a location", () => {
    const { missingColumns } = parseJudges(judgeCsv("Nadia,nadia@10pearls.com,0300-1111111\n"));
    expect(missingColumns).toEqual([]);
  });
});

describe("problemsToCsv", () => {
  it("produces a file the organisers can correct and re-upload", () => {
    const csv = problemsToCsv([
      { line: 3, name: "Broken Row", email: "not-an-email", problems: ["Invalid email", "Phone is missing"] },
    ]);

    expect(csv).toContain("line,name,email,problem");
    expect(csv).toContain("Broken Row");
    expect(csv).toContain("Invalid email; Phone is missing");
  });

  it("quotes a value containing a comma", () => {
    const csv = problemsToCsv([{ line: 2, name: "Khan, Ayesha", email: "a@b.com", problems: ["x"] }]);
    expect(csv).toContain('"Khan, Ayesha"');
  });
});
