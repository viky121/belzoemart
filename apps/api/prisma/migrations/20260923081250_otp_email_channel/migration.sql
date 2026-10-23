/*
  Warnings:

  - You are about to drop the column `phone` on the `otp_requests` table. All the data in the column will be lost.
  - Added the required column `email` to the `otp_requests` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "otp_requests_phone_idx";

-- AlterTable
ALTER TABLE "otp_requests" DROP COLUMN "phone",
ADD COLUMN     "email" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "otp_requests_email_idx" ON "otp_requests"("email");
