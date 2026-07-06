-- CreateTable
CREATE TABLE "AlertNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "chatId" TEXT,
    "tokenAddress" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertNotification_tokenAddress_idx" ON "AlertNotification"("tokenAddress");

-- CreateIndex
CREATE INDEX "AlertNotification_chatId_idx" ON "AlertNotification"("chatId");

-- CreateIndex
CREATE INDEX "AlertNotification_deliveredAt_idx" ON "AlertNotification"("deliveredAt");
