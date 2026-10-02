/**
 * Builds the test accounts for a load test run.
 *
 * Produces two things from one definition, which is the point: a CSV to feed the
 * admin console's Bulk Create, and a JSON file of the credentials k6 will sign in
 * with. They cannot drift apart, because the password in the JSON is computed with the
 * same rule the application uses — first name plus the last five digits of the CNIC
 * for participants, of the phone number for judges.
 *
 * Every account is marked. The email prefix, the name prefix and the CNIC range all
 * say "loadtest", so that when it comes to clearing them up there is no judgement call
 * about whether a row might be a real participant.
 *
 *   node loadtest/generate-accounts.mjs 500 50
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "accounts");

const participantCount = Number(process.argv[2] ?? 500);
const judgeCount = Number(process.argv[3] ?? 50);

if (!Number.isInteger(participantCount) || participantCount < 1) {
  console.error("usage: node loadtest/generate-accounts.mjs <participants> <judges>");
  process.exit(1);
}

/** Unmistakable, and never a string a real participant would produce. */
const MARK = "loadtest";

const CITIES = ["Karachi", "Lahore", "Islamabad"];

/**
 * The application's own rule, restated here rather than imported.
 *
 * src/lib/bulk-import.ts is TypeScript inside the Next build; this script has to run
 * under plain node before anything is installed. Kept to four lines and checked
 * against the real thing by the first successful login of every run — if the rule ever
 * changes, every account fails to sign in at once, which is impossible to miss.
 */
function derivePassword(fullName, digitsSource) {
  const firstWord = fullName.trim().split(/\s+/)[0] ?? "";
  const firstName = firstWord.replace(/[^\p{L}\p{N}]/gu, "");
  const lastFive = digitsSource.replace(/\D/g, "").slice(-5);
  return firstName + lastFive;
}

const participants = [];
const judges = [];

for (let i = 0; i < participantCount; i++) {
  const n = String(i).padStart(5, "0");

  // 13 digits, in a range no issued CNIC occupies, so these can never collide with a
  // real participant's.
  const cnic = `9999${n}${String(i % 10000).padStart(4, "0")}`.slice(0, 13).padEnd(13, "0");
  // +92 3XX XXXXXXX, unique per account.
  const phone = `+923${String(100000000 + i).slice(0, 9)}`;
  const fullName = `Loadtest P${n}`;

  participants.push({
    fullName,
    email: `${MARK}-p${n}@example.com`,
    phone,
    cnic,
    location: CITIES[i % CITIES.length],
    password: derivePassword(fullName, cnic),
  });
}

for (let i = 0; i < judgeCount; i++) {
  const n = String(i).padStart(3, "0");
  const phone = `+923${String(400000000 + i).slice(0, 9)}`;
  const fullName = `Loadtest J${n}`;

  judges.push({
    fullName,
    // Judges must be on the organisation's domain — the application enforces it.
    email: `${MARK}-j${n}@10pearls.com`,
    phone,
    password: derivePassword(fullName, phone),
  });
}

function csv(rows, columns) {
  const head = columns.join(",");
  const body = rows.map((row) => columns.map((c) => row[c]).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

/** k6 signs in with the email, which is the identifier least likely to be reformatted. */
const credentials = (rows) =>
  rows.map((row) => ({ username: row.email, password: row.password }));

mkdirSync(OUT, { recursive: true });

writeFileSync(
  join(OUT, "participants.csv"),
  csv(participants, ["fullName", "email", "phone", "cnic", "location"]),
);
writeFileSync(join(OUT, "judges.csv"), csv(judges, ["fullName", "email", "phone"]));

writeFileSync(
  join(OUT, "participants.json"),
  JSON.stringify(credentials(participants), null, 0),
);
writeFileSync(join(OUT, "judges.json"), JSON.stringify(credentials(judges), null, 0));

console.log(`Wrote to ${OUT}:`);
console.log(`  participants.csv   ${participants.length} rows  -> Bulk Create on the Participants tab`);
console.log(`  judges.csv         ${judges.length} rows  -> Bulk Create on the Judges tab`);
console.log(`  participants.json  credentials for k6`);
console.log(`  judges.json        credentials for k6`);
console.log("");
console.log(`Every account is marked "${MARK}" in its name and email.`);
console.log(`Example participant: ${participants[0].email} / ${participants[0].password}`);
console.log(`Example judge:       ${judges[0].email} / ${judges[0].password}`);
console.log("");
console.log("These files contain credentials and are git-ignored. Delete them after the run.");
