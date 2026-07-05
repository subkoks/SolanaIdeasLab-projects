-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "TelegramSubscriber" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletWatch" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "label" TEXT,
    "lastSignature" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletActivityEvent" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "lamports" BIGINT,
    "tokenMint" TEXT,
    "summary" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSubscriber_chatId_key" ON "TelegramSubscriber"("chatId");

-- CreateIndex
CREATE INDEX "WalletWatch_walletAddress_idx" ON "WalletWatch"("walletAddress");

-- CreateIndex
CREATE INDEX "WalletWatch_active_idx" ON "WalletWatch"("active");

-- CreateIndex
CREATE UNIQUE INDEX "WalletWatch_subscriberId_walletAddress_key" ON "WalletWatch"("subscriberId", "walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "WalletActivityEvent_signature_key" ON "WalletActivityEvent"("signature");

-- CreateIndex
CREATE INDEX "WalletActivityEvent_walletAddress_observedAt_idx" ON "WalletActivityEvent"("walletAddress", "observedAt");

-- AddForeignKey
ALTER TABLE "WalletWatch" ADD CONSTRAINT "WalletWatch_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "TelegramSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
