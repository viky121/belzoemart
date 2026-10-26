-- One row per real customer search, for the Search terms report.
-- CreateEnum
CREATE TYPE "SearchLogSource" AS ENUM ('web', 'app');

-- CreateTable
CREATE TABLE "search_logs" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "termNorm" TEXT NOT NULL,
    "source" "SearchLogSource" NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "topProductId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_logs_createdAt_idx" ON "search_logs"("createdAt");

-- CreateIndex
CREATE INDEX "search_logs_termNorm_createdAt_idx" ON "search_logs"("termNorm", "createdAt");

-- AddForeignKey
ALTER TABLE "search_logs" ADD CONSTRAINT "search_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
