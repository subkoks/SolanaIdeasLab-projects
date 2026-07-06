export function parsePumpFunLaunchNotification(
  payload: unknown,
): { blockTime: number | null; signature: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const message = payload as {
    params?: {
      result?: {
        signature?: string;
        blockTime?: number | null;
        transaction?: {
          meta?: { logMessages?: string[] };
        };
      };
    };
  };

  const result = message.params?.result;
  if (!result?.signature) {
    return null;
  }

  const logs = result.transaction?.meta?.logMessages ?? [];
  const isLaunch = logs.some((entry) =>
    entry.includes("Instruction: InitializeMint2"),
  );

  if (!isLaunch) {
    return null;
  }

  return {
    signature: result.signature,
    blockTime: result.blockTime ?? null,
  };
}
