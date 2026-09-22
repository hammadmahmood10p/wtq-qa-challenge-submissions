import { describe, expect, it } from "vitest";
import { judgeSignupSchema, participantSignupSchema, passwordStrength } from "./auth";

const validParticipant = {
  idCardNumber: "42101-1234567-8",
  fullName: "Ayesha Khan",
  email: "Ayesha@Example.com",
  phone: "0300-1234567",
  location: "KARACHI",
  password: "Challenge2026",
  confirmPassword: "Challenge2026",
};

const validJudge = {
  email: "judge@10pearls.com",
  fullName: "Sana Ahmed",
  password: "Challenge2026",
  confirmPassword: "Challenge2026",
};

/** Whatever a participant types, the server stores the canonical form. */
describe("participantSignupSchema", () => {
  it("accepts and normalises a valid signup", () => {
    const result = participantSignupSchema.safeParse(validParticipant);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.idCardNumber).toBe("4210112345678");
    expect(result.data.phone).toBe("+923001234567");
    expect(result.data.email).toBe("ayesha@example.com");
  });

  it("reports mismatched passwords against the confirm field", () => {
    const result = participantSignupSchema.safeParse({
      ...validParticipant,
      confirmPassword: "Different2026",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(["confirmPassword"]);
  });

  it.each([
    ["short", "Ab1"],
    ["no uppercase", "challenge2026"],
    ["no lowercase", "CHALLENGE2026"],
    ["no number", "ChallengeEvent"],
  ])("rejects a password with %s", (_label, password) => {
    const result = participantSignupSchema.safeParse({
      ...validParticipant,
      password,
      confirmPassword: password,
    });
    expect(result.success).toBe(false);
  });

  it.each(["421011234567", "42101123456789", "abcdefghijklm"])(
    "rejects the invalid CNIC %s",
    (idCardNumber) => {
      expect(participantSignupSchema.safeParse({ ...validParticipant, idCardNumber }).success).toBe(
        false,
      );
    },
  );

  it("requires one of the three cities", () => {
    expect(
      participantSignupSchema.safeParse({ ...validParticipant, location: "PESHAWAR" }).success,
    ).toBe(false);
  });
});

describe("judgeSignupSchema", () => {
  it("accepts a 10Pearls address", () => {
    expect(judgeSignupSchema.safeParse(validJudge).success).toBe(true);
  });

  it.each(["judge@gmail.com", "judge@10pearls.com.attacker.io", "judge@not10pearls.com"])(
    "rejects %s",
    (email) => {
      expect(judgeSignupSchema.safeParse({ ...validJudge, email }).success).toBe(false);
    },
  );
});

describe("passwordStrength", () => {
  it("scores from empty to strong", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("Challenge1")).toBeGreaterThan(0);
    expect(passwordStrength("Challenge2026!wtq")).toBe(4);
  });
});
