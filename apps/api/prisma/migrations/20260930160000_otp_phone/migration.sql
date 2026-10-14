-- AlterTable: allow phone-based OTP (email becomes optional, add phone)
ALTER TABLE "otp_requests" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "otp_requests" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE INDEX "otp_requests_phone_idx" ON "otp_requests"("phone");
