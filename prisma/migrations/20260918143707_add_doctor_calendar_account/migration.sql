-- Drop leftover dev-only messages from the shelved staff-handoff prototype: the STAFF
-- role is being removed below and no longer exists in the schema.
DELETE FROM "Message" WHERE "role" = 'STAFF';

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

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "status";

-- DropEnum
DROP TYPE "ConversationStatus";

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

