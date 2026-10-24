-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('new', 'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'delivered', 'failed_attempt', 'returned', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryPaymentMode" AS ENUM ('cod', 'prepaid');

-- CreateEnum
CREATE TYPE "DeliveryAttention" AS ENUM ('rejected', 'no_reply', 'max_attempts', 'payment_review');

-- CreateEnum
CREATE TYPE "DeliveryActorKind" AS ENUM ('admin', 'partner', 'system');

-- CreateEnum
CREATE TYPE "DeliveryAssignmentOutcome" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'unassigned', 'reassigned', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryOtpStatus" AS ENUM ('active', 'verified', 'expired', 'superseded', 'locked');

-- CreateEnum
CREATE TYPE "DeliverySendStatus" AS ENUM ('pending', 'sent', 'failed');

-- AlterEnum
ALTER TYPE "PrincipalKind" ADD VALUE 'partner';

-- CreateTable
CREATE TABLE "delivery_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "maxActiveJobs" INTEGER NOT NULL DEFAULT 10,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zone_pincodes" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,

    CONSTRAINT "delivery_zone_pincodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_partner_zones" (
    "partnerId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "delivery_partner_zones_pkey" PRIMARY KEY ("partnerId","zoneId")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'new',
    "partnerId" TEXT,
    "currentAssignmentId" TEXT,
    "shipmentId" TEXT,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "paymentMode" "DeliveryPaymentMode" NOT NULL,
    "codAmount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL,
    "destName" TEXT NOT NULL,
    "destPhone" TEXT NOT NULL,
    "destLine1" TEXT NOT NULL,
    "destLine2" TEXT,
    "destCity" TEXT NOT NULL,
    "destState" TEXT NOT NULL,
    "destPincode" TEXT NOT NULL,
    "otpPhone" TEXT NOT NULL,
    "otpLockedUntil" TIMESTAMP(3),
    "zoneId" TEXT,
    "trackingToken" TEXT NOT NULL,
    "trackingExpiresAt" TIMESTAMP(3),
    "attention" "DeliveryAttention",
    "acceptDeadlineAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_assignments" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "assignedByKind" "DeliveryActorKind" NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseDeadlineAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "outcome" "DeliveryAssignmentOutcome" NOT NULL DEFAULT 'pending',
    "reason" TEXT,

    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus",
    "actorKind" "DeliveryActorKind" NOT NULL,
    "actorId" TEXT,
    "reasonCode" TEXT,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "attemptNo" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_otps" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "attemptNo" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "DeliveryOtpStatus" NOT NULL DEFAULT 'active',
    "sendStatus" "DeliverySendStatus" NOT NULL DEFAULT 'pending',
    "wrongGuesses" INTEGER NOT NULL DEFAULT 0,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_partners_mobile_key" ON "delivery_partners"("mobile");

-- CreateIndex
CREATE INDEX "delivery_partners_isActive_isOnline_idx" ON "delivery_partners"("isActive", "isOnline");

-- CreateIndex
CREATE INDEX "delivery_partners_isOnline_lastSeenAt_idx" ON "delivery_partners"("isOnline", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_name_key" ON "delivery_zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_pincodes_pincode_key" ON "delivery_zone_pincodes"("pincode");

-- CreateIndex
CREATE INDEX "delivery_zone_pincodes_zoneId_idx" ON "delivery_zone_pincodes"("zoneId");

-- CreateIndex
CREATE INDEX "delivery_partner_zones_zoneId_idx" ON "delivery_partner_zones"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_jobs_code_key" ON "delivery_jobs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_jobs_trackingToken_key" ON "delivery_jobs"("trackingToken");

-- CreateIndex
CREATE INDEX "delivery_jobs_orderId_idx" ON "delivery_jobs"("orderId");

-- CreateIndex
CREATE INDEX "delivery_jobs_partnerId_status_idx" ON "delivery_jobs"("partnerId", "status");

-- CreateIndex
CREATE INDEX "delivery_jobs_status_acceptDeadlineAt_idx" ON "delivery_jobs"("status", "acceptDeadlineAt");

-- CreateIndex
CREATE INDEX "delivery_jobs_status_createdAt_idx" ON "delivery_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_assignments_jobId_idx" ON "delivery_assignments"("jobId");

-- CreateIndex
CREATE INDEX "delivery_assignments_partnerId_outcome_idx" ON "delivery_assignments"("partnerId", "outcome");

-- CreateIndex
CREATE INDEX "delivery_events_jobId_createdAt_idx" ON "delivery_events"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_events_event_createdAt_idx" ON "delivery_events"("event", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_otps_jobId_attemptNo_createdAt_idx" ON "delivery_otps"("jobId", "attemptNo", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_otps_status_expiresAt_idx" ON "delivery_otps"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "delivery_zone_pincodes" ADD CONSTRAINT "delivery_zone_pincodes_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_partner_zones" ADD CONSTRAINT "delivery_partner_zones_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "delivery_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_partner_zones" ADD CONSTRAINT "delivery_partner_zones_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "delivery_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "delivery_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_otps" ADD CONSTRAINT "delivery_otps_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- U8.1 delivery core: guarantees that must hold even if someone writes SQL
-- directly (functional design: domain-entities, section 3).
-- ===========================================================================

-- Format checks -------------------------------------------------------------
ALTER TABLE "delivery_partners"
  ADD CONSTRAINT "delivery_partners_mobile_chk" CHECK ("mobile" ~ '^[6-9][0-9]{9}$'),
  ADD CONSTRAINT "delivery_partners_max_active_chk" CHECK ("maxActiveJobs" BETWEEN 1 AND 100);

ALTER TABLE "delivery_zone_pincodes"
  ADD CONSTRAINT "delivery_zone_pincodes_pincode_chk" CHECK ("pincode" ~ '^[1-9][0-9]{5}$');

ALTER TABLE "delivery_jobs"
  ADD CONSTRAINT "delivery_jobs_dest_pincode_chk" CHECK ("destPincode" ~ '^[1-9][0-9]{5}$'),
  ADD CONSTRAINT "delivery_jobs_otp_phone_chk" CHECK ("otpPhone" ~ '^[6-9][0-9]{9}$'),
  ADD CONSTRAINT "delivery_jobs_attempts_chk" CHECK ("attemptsUsed" >= 0 AND "maxAttempts" >= 1),
  ADD CONSTRAINT "delivery_jobs_cod_amount_chk" CHECK ("codAmount" >= 0);

ALTER TABLE "delivery_otps"
  ADD CONSTRAINT "delivery_otps_counters_chk" CHECK ("wrongGuesses" >= 0 AND "sendCount" >= 1);

-- One active job per order, one open assignment per job, one active OTP per job ---
CREATE UNIQUE INDEX "delivery_jobs_one_active_per_order"
  ON "delivery_jobs" ("orderId")
  WHERE "status" NOT IN ('delivered', 'returned', 'cancelled');

CREATE UNIQUE INDEX "delivery_assignments_one_open_per_job"
  ON "delivery_assignments" ("jobId")
  WHERE "outcome" IN ('pending', 'accepted');

CREATE UNIQUE INDEX "delivery_otps_one_active_per_job"
  ON "delivery_otps" ("jobId")
  WHERE "status" = 'active';

-- delivery_events is append-only -------------------------------------------------
-- The only allowed change is clearing the GPS point (lat and lng to NULL) once it is older
-- than the retention period (privacy, NQ2); every other column must stay the same.
CREATE OR REPLACE FUNCTION delivery_events_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW."lat" IS NULL AND NEW."lng" IS NULL
     AND (to_jsonb(NEW) - 'lat' - 'lng') = (to_jsonb(OLD) - 'lat' - 'lng') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'delivery_events is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "delivery_events_guard_trg"
  BEFORE UPDATE OR DELETE ON "delivery_events"
  FOR EACH ROW EXECUTE FUNCTION delivery_events_guard();

-- Final statuses are final, and "delivered" needs a verified OTP ------------------
CREATE OR REPLACE FUNCTION delivery_jobs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" IN ('delivered', 'returned') THEN
      RAISE EXCEPTION 'a delivery job cannot be created as %', NEW."status" USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" IN ('delivered', 'returned', 'cancelled') AND NEW."status" <> OLD."status" THEN
    RAISE EXCEPTION 'delivery job % is % and cannot change status', OLD."id", OLD."status"
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."status" = 'delivered' AND OLD."status" <> 'delivered' THEN
    IF OLD."status" <> 'arrived' THEN
      RAISE EXCEPTION 'a delivery job can only be delivered from arrived' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "delivery_otps" o WHERE o."jobId" = NEW."id" AND o."status" = 'verified'
    ) THEN
      RAISE EXCEPTION 'a delivery job cannot be delivered without a verified OTP' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "delivery_jobs_guard_trg"
  BEFORE INSERT OR UPDATE ON "delivery_jobs"
  FOR EACH ROW EXECUTE FUNCTION delivery_jobs_guard();
