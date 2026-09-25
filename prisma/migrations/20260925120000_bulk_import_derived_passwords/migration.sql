-- Bulk import of participants and judges.
--
-- `passwordIsDerived` records that an account's password is still the one the import
-- computed from the person's own details, so the admin console can show it back
-- without anything recoverable being stored. It goes false the moment the password
-- changes, because from then on the hash and the derivation disagree.
--
-- `phoneE164` gives judges a phone number, which is where their first password comes
-- from (the way a participant's comes from their CNIC) and which also lets them sign
-- in with it. Nullable: a judge who signed up themselves never gave one.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "passwordIsDerived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "judge_profiles" ADD COLUMN "phoneE164" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "judge_profiles_phoneE164_key" ON "judge_profiles"("phoneE164");
