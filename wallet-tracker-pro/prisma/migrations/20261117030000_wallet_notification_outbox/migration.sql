-- CreateTable
CREATE TABLE "WalletNotification" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletNotification_watchId_signature_key" ON "WalletNotification"("watchId", "signature");

-- CreateIndex
CREATE INDEX "WalletNotification_watchId_deliveredAt_claimedAt_createdAt_idx" ON "WalletNotification"("watchId", "deliveredAt", "claimedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletNotification" ADD CONSTRAINT "WalletNotification_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "WalletWatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
