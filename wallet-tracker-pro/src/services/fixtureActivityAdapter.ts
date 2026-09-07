export const FIXTURE_ACTIVITY_IDS = ['steady-wallet','review-wallet','suppress-wallet'] as const;
export type FixtureActivityId = (typeof FIXTURE_ACTIVITY_IDS)[number];
export const isFixtureActivityId = (v: unknown): v is FixtureActivityId => typeof v === 'string' && FIXTURE_ACTIVITY_IDS.includes(v as FixtureActivityId);

export interface FixtureActivityItem {
  readonly id: string;
  readonly timestamp: string;
  readonly category: 'fixture-observation' | 'fixture-review' | 'fixture-suppression';
  readonly severity: 'positive' | 'warning' | 'critical';
  readonly title: string;
  readonly detail: string;
}
export interface FixtureWallet {
  readonly id: string;
  readonly address: string;
  readonly label: string;
  readonly status: 'steady' | 'review' | 'suppressed';
  readonly confidence: number;
  readonly summary: string;
  readonly nextAction: string;
}
export interface FixtureActivityResponse {
  readonly source: 'local-fixture';
  readonly fixtureId: FixtureActivityId;
  readonly isSimulated: true;
  readonly generatedAt: string;
  readonly wallet: FixtureWallet;
  readonly activity: readonly FixtureActivityItem[];
}

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const _deepFreeze = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj as object);
  for (const key of Object.keys(obj as object)) _deepFreeze((obj as Record<string, unknown>)[key]);
  return obj;
};

const MAP = _deepFreeze({
  'steady-wallet': {
    wallet: {
      id: 'fixture-wallet-steady-01',
      address: '44444444444444444444444444444444444444444444',
      label: 'Fixture Steady Wallet A',
      status: 'steady' as const,
      confidence: 0.91,
      summary: 'Simulated local fixture: steady wallet observation.',
      nextAction: 'Monitor this simulated fixture in the local demo.',
    },
    activity: [
      { id: 'act-steady-1', timestamp: '2026-01-01T01:00:00.000Z', category: 'fixture-observation' as const, severity: 'positive' as const, title: 'Simulated observation', detail: 'Simulated positive fixture event; no live data.' },
      { id: 'act-steady-2', timestamp: '2026-01-01T02:00:00.000Z', category: 'fixture-observation' as const, severity: 'positive' as const, title: 'Simulated stable context', detail: 'Simulated stable fixture context; no market claim.' },
      { id: 'act-steady-3', timestamp: '2026-01-01T03:00:00.000Z', category: 'fixture-observation' as const, severity: 'positive' as const, title: 'Simulated consistent signal', detail: 'Simulated consistent fixture signal.' },
    ],
  },
  'review-wallet': {
    wallet: {
      id: 'fixture-wallet-review-01',
      address: '55555555555555555555555555555555555555555555',
      label: 'Fixture Review Wallet B',
      status: 'review' as const,
      confidence: 0.76,
      summary: 'Simulated local fixture: wallet review required.',
      nextAction: 'Review simulated activity before advancing this fixture.',
    },
    activity: [
      { id: 'act-review-1', timestamp: '2026-01-01T01:00:00.000Z', category: 'fixture-review' as const, severity: 'warning' as const, title: 'Simulated warning A', detail: 'Simulated warning signal; not a live claim.' },
      { id: 'act-review-2', timestamp: '2026-01-01T02:00:00.000Z', category: 'fixture-review' as const, severity: 'warning' as const, title: 'Simulated warning B', detail: 'Simulated warning signal; not a live claim.' },
      { id: 'act-review-3', timestamp: '2026-01-01T03:00:00.000Z', category: 'fixture-review' as const, severity: 'positive' as const, title: 'Simulated contextual note', detail: 'Simulated contextual fixture note.' },
    ],
  },
  'suppress-wallet': {
    wallet: {
      id: 'fixture-wallet-suppress-01',
      address: '66666666666666666666666666666666666666666666',
      label: 'Fixture Suppress Wallet C',
      status: 'suppressed' as const,
      confidence: 0.94,
      summary: 'Simulated local fixture: wallet suppression required.',
      nextAction: 'Suppress this simulated fixture in the local demo.',
    },
    activity: [
      { id: 'act-suppress-1', timestamp: '2026-01-01T01:00:00.000Z', category: 'fixture-suppression' as const, severity: 'critical' as const, title: 'Simulated critical A', detail: 'Simulated critical fixture signal.' },
      { id: 'act-suppress-2', timestamp: '2026-01-01T02:00:00.000Z', category: 'fixture-suppression' as const, severity: 'critical' as const, title: 'Simulated critical B', detail: 'Simulated critical fixture signal.' },
      { id: 'act-suppress-3', timestamp: '2026-01-01T03:00:00.000Z', category: 'fixture-suppression' as const, severity: 'critical' as const, title: 'Simulated critical C', detail: 'Simulated critical fixture signal.' },
    ],
  },
}) as Record<FixtureActivityId, { wallet: FixtureWallet; activity: FixtureActivityItem[] }>;

export const getFixtureActivity = (id: FixtureActivityId): FixtureActivityResponse => {
  const def = MAP[id];
  const wallet = JSON.parse(JSON.stringify(def.wallet)) as FixtureWallet;
  const activity = JSON.parse(JSON.stringify(def.activity)) as FixtureActivityItem[];
  return {
    source: 'local-fixture',
    fixtureId: id,
    isSimulated: true,
    generatedAt: FIXED_TIMESTAMP,
    wallet,
    activity,
  };
};
