-- DRAFT: deliberately outside automatic migration discovery. Not applied.
-- Activation requires the disposable PostgreSQL gates in
-- docs/WALLET-DELIVERY.md. This changes identities, never creates historical sends.
BEGIN;

ALTER TABLE "WalletWatch" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WalletActivityEvent" ADD COLUMN "movementKey" TEXT;
ALTER TABLE "WalletActivityEvent" ADD COLUMN "identityVersion" INTEGER NOT NULL DEFAULT 0;
UPDATE "WalletActivityEvent" SET "movementKey" = 'legacy:' || "id";
ALTER TABLE "WalletActivityEvent" ALTER COLUMN "movementKey" SET NOT NULL;
ALTER TABLE "WalletActivityEvent" ALTER COLUMN "identityVersion" SET DEFAULT 1;
DROP INDEX "WalletActivityEvent_signature_key";
CREATE UNIQUE INDEX "WalletActivityEvent_walletAddress_signature_movementKey_key"
  ON "WalletActivityEvent" ("walletAddress", "signature", "movementKey");
CREATE INDEX "WalletActivityEvent_walletAddress_signature_identityVersion_idx"
  ON "WalletActivityEvent" ("walletAddress", "signature", "identityVersion");
ALTER TABLE "WalletActivityEvent" ADD CONSTRAINT "WalletActivityEvent_identityVersion_check"
  CHECK ("identityVersion" IN (0, 1));

CREATE TABLE "WalletDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "watchId" TEXT NOT NULL,
  "watchRevision" INTEGER NOT NULL,
  "activityId" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "movementKey" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "uncertainAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "telegramMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletDelivery_status_check"
    CHECK ("status" IN ('pending', 'dispatching', 'sent', 'uncertain', 'cancelled')),
  CONSTRAINT "WalletDelivery_claim_check" CHECK (
    ("status" IN ('pending', 'cancelled') AND "claimToken" IS NULL AND "claimedAt" IS NULL)
    OR ("status" IN ('dispatching', 'sent', 'uncertain') AND "claimToken" IS NOT NULL AND "claimedAt" IS NOT NULL)
  ),
  CONSTRAINT "WalletDelivery_sent_check" CHECK (
    ("status" = 'sent') = ("sentAt" IS NOT NULL AND "telegramMessageId" IS NOT NULL)
  ),
  CONSTRAINT "WalletDelivery_uncertain_check" CHECK (
    ("status" = 'uncertain') = ("uncertainAt" IS NOT NULL)
  ),
  CONSTRAINT "WalletDelivery_watchId_fkey" FOREIGN KEY ("watchId")
    REFERENCES "WalletWatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WalletDelivery_activityId_fkey" FOREIGN KEY ("activityId")
    REFERENCES "WalletActivityEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WalletDelivery_watchId_signature_movementKey_key"
  ON "WalletDelivery" ("watchId", "signature", "movementKey");
CREATE INDEX "WalletDelivery_status_createdAt_id_idx" ON "WalletDelivery" ("status", "createdAt", "id");
CREATE INDEX "WalletDelivery_status_claimedAt_idx" ON "WalletDelivery" ("status", "claimedAt");
CREATE INDEX "WalletDelivery_activityId_idx" ON "WalletDelivery" ("activityId");
CREATE INDEX "WalletDelivery_watchId_status_idx" ON "WalletDelivery" ("watchId", "status");
COMMIT;
