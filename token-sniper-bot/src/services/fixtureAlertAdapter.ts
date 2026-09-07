export const FIXTURE_ALERT_IDS = ["watch-launch","review-launch","suppress-launch"] as const;
export type FixtureAlertId = (typeof FIXTURE_ALERT_IDS)[number];
export const isFixtureAlertId = (v: unknown): v is FixtureAlertId => typeof v === "string" && FIXTURE_ALERT_IDS.includes(v as FixtureAlertId);

export interface FixtureAlertSignal { readonly id: string; readonly severity: "positive"|"warning"|"critical"; readonly title: string; readonly detail: string; }
export interface FixtureAlert { readonly id: string; readonly tokenAddress: string; readonly tokenLabel: string; readonly category: string; readonly severity: "low"|"medium"|"high"; readonly confidence: number; readonly recommendation: "watch"|"review"|"suppress"; readonly summary: string; readonly nextAction: string; readonly signals: readonly FixtureAlertSignal[]; }
export interface FixtureAlertResponse { readonly source: "local-fixture"; readonly fixtureId: FixtureAlertId; readonly isSimulated: true; readonly generatedAt: string; readonly alert: FixtureAlert; }

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

const _deepFreeze = (obj: any): any => {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) _deepFreeze(obj[key]);
  return obj;
};

const MAP: Record<FixtureAlertId, FixtureAlert> = _deepFreeze({
  "watch-launch": {
    id: "fixture-alert-watch-01",
    tokenAddress: "11111111111111111111111111111111",
    tokenLabel: "Fixture Launch Watch A",
    category: "launch-watch",
    severity: "low",
    confidence: 0.92,
    recommendation: "watch",
    summary: "Simulated local fixture: low-severity launch watch for review.",
    nextAction: "Monitor this simulated fixture in the local demo.",
    signals: [
      { id: "sig-watch-pos-1", severity: "positive", title: "Fixture signal positive", detail: "Simulated positive fixture signal; no live data." },
      { id: "sig-watch-pos-2", severity: "positive", title: "Fixture context stable", detail: "Simulated stable context; no market claim." },
    ],
  },
  "review-launch": {
    id: "fixture-alert-review-01",
    tokenAddress: "22222222222222222222222222222222",
    tokenLabel: "Fixture Launch Review B",
    category: "risk-review",
    severity: "medium",
    confidence: 0.78,
    recommendation: "review",
    summary: "Simulated local fixture: medium-severity risk review.",
    nextAction: "Review simulated signals before advancing this fixture.",
    signals: [
      { id: "sig-review-warn-1", severity: "warning", title: "Fixture warning A", detail: "Simulated warning; not a live claim." },
      { id: "sig-review-warn-2", severity: "warning", title: "Fixture warning B", detail: "Simulated warning; not a live claim." },
      { id: "sig-review-pos-1", severity: "positive", title: "Fixture context", detail: "Simulated contextual signal." },
    ],
  },
  "suppress-launch": {
    id: "fixture-alert-suppress-01",
    tokenAddress: "33333333333333333333333333333333",
    tokenLabel: "Fixture Launch Suppress C",
    category: "suppressed",
    severity: "high",
    confidence: 0.95,
    recommendation: "suppress",
    summary: "Simulated local fixture: high-severity suppression.",
    nextAction: "Suppress this simulated fixture in the local demo.",
    signals: [
      { id: "sig-suppress-crit-1", severity: "critical", title: "Fixture critical A", detail: "Simulated critical fixture signal." },
      { id: "sig-suppress-crit-2", severity: "critical", title: "Fixture critical B", detail: "Simulated critical fixture signal." },
    ],
  },
});

export const getFixtureAlert = (id: FixtureAlertId): FixtureAlertResponse => {
  const alert = JSON.parse(JSON.stringify(MAP[id])) as FixtureAlert;
  return { source: "local-fixture" as const, fixtureId: id, isSimulated: true, generatedAt: FIXED_TIMESTAMP, alert };
};
