'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './demo.module.css';

const ALLOWED = ['steady-wallet', 'review-wallet', 'suppress-wallet'] as const;
type FixtureId = (typeof ALLOWED)[number];

interface ActivityItem {
  id: string;
  timestamp: string;
  category: string;
  severity: 'positive' | 'warning' | 'critical';
  title: string;
  detail: string;
}

interface Wallet {
  id: string;
  address: string;
  label: string;
  status: 'steady' | 'review' | 'suppressed';
  confidence: number;
  summary: string;
  nextAction: string;
}

interface FixtureResponse {
  source: 'local-fixture';
  fixtureId: FixtureId;
  isSimulated: true;
  generatedAt: string;
  wallet: Wallet;
  activity: ActivityItem[];
}

type View = 'empty' | 'loading' | 'success' | 'error';

export default function DemoClient() {
  const [selected, setSelected] = useState<FixtureId | null>(null);
  const [view, setView] = useState<View>('empty');
  const [data, setData] = useState<FixtureResponse | null>(null);

  const onSelect = useCallback((id: string) => {
    if ((ALLOWED as readonly string[]).includes(id)) {
      setSelected(id as FixtureId);
    }
  }, []);

  // eslint-disable react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') onSelect('steady-wallet');
      else if (e.key === '2') onSelect('review-wallet');
      else if (e.key === '3') onSelect('suppress-wallet');
      else if (e.key === 'Enter' && selected) void load();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const load = useCallback(async () => {
    if (!selected) return;
    setView('loading');
    setData(null);
    try {
      const r = await fetch('/api/demo/activity?fixture=' + encodeURIComponent(selected), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new Error('bad-status');
      const json = (await r.json()) as unknown;
      if (
        !json ||
        typeof json !== 'object' ||
        (json as { isSimulated?: unknown }).isSimulated !== true ||
        (json as { source?: unknown }).source !== 'local-fixture'
      ) {
        throw new Error('unexpected-payload');
      }
      setData(json as FixtureResponse);
      setView('success');
    } catch {
      setView('error');
    }
  }, [selected]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Wallet Tracker Pro</h1>
        <p className={styles.subtitle}>Local Fixture Activity Demo</p>
        <span className={styles.badge}>LOCAL ONLY · SIMULATED DATA · NO WALLET CONNECTION</span>
        <nav className={styles.localNav} aria-label="Local demo navigation">
          <a href="http://localhost:3002/">Console</a>
          <a href="http://localhost:3000/demo">Token Safety</a>
          <a href="http://localhost:8000/demo">Token Sniper</a>
          <a href="http://localhost:3001/demo" aria-current="page">Wallet Tracker</a>
        </nav>
      </header>
      <main className={styles.main}>
        <aside className={styles.panel} aria-label="Fixture selector">
          <h2 className={styles.h2}>Select Scenario</h2>
          <div className={styles.cards}>
            <button
              type="button"
              className={selected === 'steady-wallet' ? styles.cardSelected : styles.card}
              onClick={() => onSelect('steady-wallet')}
            >
              <h3>Steady Wallet</h3>
              <p>Expected state: Steady · Positive simulated activity posture</p>
            </button>
            <button
              type="button"
              className={selected === 'review-wallet' ? styles.cardSelected : styles.card}
              onClick={() => onSelect('review-wallet')}
            >
              <h3>Review Wallet</h3>
              <p>Expected state: Review · Warning simulated activity posture</p>
            </button>
            <button
              type="button"
              className={selected === 'suppress-wallet' ? styles.cardSelected : styles.card}
              onClick={() => onSelect('suppress-wallet')}
            >
              <h3>Suppress Wallet</h3>
              <p>Expected state: Suppressed · Critical simulated activity posture</p>
            </button>
          </div>
          <button
            type="button"
            className={styles.loadBtn}
            disabled={!selected}
            onClick={() => void load()}
          >
            Load Local Activity
          </button>
          <p className={styles.hint}>Keys 1 / 2 / 3 select; Enter loads.</p>
        </aside>
        <section className={styles.panel} aria-label="Result" aria-live="polite">
          <h2 className={styles.h2}>Activity Timeline</h2>
          {view === 'empty' && <div className={styles.empty}>Select a scenario and load.</div>}
          {view === 'loading' && <div className={styles.empty}>Loading simulated fixture…</div>}
          {view === 'error' && (
            <div className={styles.errorBox}>Local fixture request failed. Try again.</div>
          )}
          {view === 'success' && data && (
            <div>
              <div className={styles.badges}>
                <span className={styles['bdgStatus_' + data.wallet.status]}>{data.wallet.status}</span>
                <span className={styles.bdgSim}>Simulated</span>
                <span className={styles.bdgConf}>{Math.round(data.wallet.confidence * 100)}%</span>
              </div>
              <dl className={styles.dl}>
                <dt>Wallet label</dt><dd>{data.wallet.label}</dd>
                <dt>Wallet address</dt><dd className={styles.mono}>{data.wallet.address}</dd>
                <dt>Wallet ID</dt><dd className={styles.mono}>{data.wallet.id}</dd>
                <dt>Fixture ID</dt><dd className={styles.mono}>{data.fixtureId}</dd>
                <dt>Generated</dt><dd className={styles.mono}>{data.generatedAt}</dd>
                <dt>Source</dt><dd>Local fixture</dd>
              </dl>
              <h3 className={styles.h3}>Summary</h3>
              <p>{data.wallet.summary}</p>
              <h3 className={styles.h3}>Next action</h3>
              <p>{data.wallet.nextAction}</p>
              <h3 className={styles.h3}>Activity</h3>
              <ol className={styles.timeline}>
                {data.activity.map((a) => (
                  <li key={a.id} className={styles['event_' + a.severity]}>
                    <div className={styles.eventHead}>
                      <span className={styles.eventTitle}>{a.title}</span>
                      <span className={styles['eventSev_' + a.severity]}>{a.severity}</span>
                    </div>
                    <div className={styles.eventMeta}>
                      <span className={styles.mono}>{a.timestamp}</span>
                      <span> · {a.category}</span>
                    </div>
                    <p className={styles.eventDetail}>{a.detail}</p>
                  </li>
                ))}
              </ol>
              <details className={styles.raw}>
                <summary>View Raw JSON</summary>
                <pre>{JSON.stringify(data, null, 2)}</pre>
              </details>
            </div>
          )}
        </section>
      </main>
      <footer className={styles.footer}>
        <ul className={styles.localFooter}>
          <li>Local only</li>
          <li>Simulated / deterministic fixture data</li>
          <li>No real wallet</li>
          <li>No live RPC</li>
          <li>No live blockchain activity</li>
          <li>No transaction or signing capability</li>
          <li>No external service dependency</li>
        </ul>
        <p>
          This dashboard uses deterministic local fixture activity only. No real wallet, wallet
          connection, blockchain activity, Solana RPC, database, queue, WebSocket, transaction,
          signing, or external service was used.
        </p>
      </footer>
    </div>
  );
}
