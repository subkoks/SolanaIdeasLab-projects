import type { Metadata } from 'next';
import DemoClient from './DemoClient';

export const metadata: Metadata = {
  title: 'Wallet Tracker Pro — Local Fixture Activity Demo',
};

export default function DemoPage() {
  if (process.env.NODE_ENV === 'production') {
    // Production concealment: no fixture selectors, no demo interface rendered
    return (
      <main style={{ padding: 40, textAlign: 'center', color: '#8892a8', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>Not found</h1>
        <p>This page is available only in development or test environments.</p>
      </main>
    );
  }
  return <DemoClient />;
}
