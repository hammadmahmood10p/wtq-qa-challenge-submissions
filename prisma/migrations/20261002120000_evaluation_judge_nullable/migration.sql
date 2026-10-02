-- Make an evaluation's judge optional.
--
-- "Has a row" and "somebody holds it" were the same fact and are now two. A super
-- admin taking a submission off a judge who has gone home, and reopening a finalised
-- score for a second look, are both "put it back in the pool but keep the work" — and
-- while judgeId was required the only way to express that was to delete the
-- evaluation, which cascades its scores with it.
--
-- The foreign key becomes ON DELETE SET NULL rather than restricting. That is the
-- better behaviour now that the column can hold null: deleting a judge account leaves
-- the submissions they had scored intact and unclaimed, instead of refusing the delete
-- or taking a participant's marks down with it.
--
-- Safe on existing data: every current row has a judge, and widening a NOT NULL to
-- nullable cannot invalidate one.

-- DropForeignKey
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_judgeId_fkey";

-- AlterTable
ALTER TABLE "evaluations" ALTER COLUMN "judgeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
