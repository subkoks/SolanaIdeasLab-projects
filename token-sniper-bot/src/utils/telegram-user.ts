export const telegramUserId = (chatId: number): string => `telegram:${chatId}`;

export const parseTelegramChatId = (walletAddress: string): number | null => {
  const prefix = "telegram:";
  if (!walletAddress.startsWith(prefix)) {
    return null;
  }

  const chatId = Number(walletAddress.slice(prefix.length));
  return Number.isFinite(chatId) ? Math.trunc(chatId) : null;
};
