-- Clean up drift from an earlier local prototype (the shelved staff-handoff feature)
-- that added a STAFF message role outside of any committed migration. Guarded so this
-- is safe both on that drifted dev database and on a fresh one (e.g. `prisma migrate
-- reset`), where 'STAFF' never existed in the enum to begin with.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'MessageRole' AND e.enumlabel = 'STAFF'
  ) THEN
    EXECUTE 'DELETE FROM "Message" WHERE "role" = ''STAFF''';
  END IF;
END $$;

-- AlterEnum
BEGIN;
CREATE TYPE "MessageRole_new" AS ENUM ('PATIENT', 'AI');
ALTER TABLE "Message" ALTER COLUMN "role" TYPE "MessageRole_new" USING ("role"::text::"MessageRole_new");
ALTER TYPE "MessageRole" RENAME TO "MessageRole_old";
ALTER TYPE "MessageRole_new" RENAME TO "MessageRole";
DROP TYPE "MessageRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable (IF EXISTS: same drift-cleanup reasoning as the STAFF enum value above —
-- this column/type only ever existed on the locally drifted dev database, never via a
-- committed migration)
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "status";

-- DropEnum
DROP TYPE IF EXISTS "ConversationStatus";

-- CreateTable
CREATE TABLE "DoctorCalendarAccount" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL DEFAULT 'primary',
    "refreshToken" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorCalendarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorCalendarAccount_doctorId_key" ON "DoctorCalendarAccount"("doctorId");

-- AddForeignKey
ALTER TABLE "DoctorCalendarAccount" ADD CONSTRAINT "DoctorCalendarAccount_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

