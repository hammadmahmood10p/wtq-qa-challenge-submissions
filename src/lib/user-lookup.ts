import { hashCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { detectIdentifier } from "@/lib/normalize";

/**
 * Requirement 9: one "Username" box accepting a registered email, ID card number or
 * phone number.
 *
 * The identifier is normalised first (D5), so whatever format someone types at 10am
 * on event day resolves to the account they created days earlier. This is the single
 * most likely place for a participant to get stuck, and there is no self-service
 * password reset to rescue them — an admin has to.
 */
export async function findUserByIdentifier(input: string) {
  const identifier = detectIdentifier(input);
  if (!identifier) return null;

  const select = {
    id: true,
    role: true,
    status: true,
    email: true,
    fullName: true,
    passwordHash: true,
    mustChangePassword: true,
  } as const;

  switch (identifier.kind) {
    case "email":
      return db.user.findUnique({ where: { email: identifier.value }, select });

    case "cnic": {
      const profile = await db.participantProfile.findUnique({
        where: { idCardHash: hashCnic(identifier.value) },
        select: { user: { select } },
      });
      return profile?.user ?? null;
    }

    case "phone": {
      const profile = await db.participantProfile.findUnique({
        where: { phoneE164: identifier.value },
        select: { user: { select } },
      });
      return profile?.user ?? null;
    }
  }
}
