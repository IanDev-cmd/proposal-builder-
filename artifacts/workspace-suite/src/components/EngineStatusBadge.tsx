import { useEffect, useState } from 'react';
import { PROPOSAL_ENGINE_URL } from '@/lib/backendUrls';
import { fetchWithTimeout } from '@/lib/http';

type Phase = 'warming' | 'ready';

function localEngine(): boolean {
  return PROPOSAL_ENGINE_URL.startsWith('http://127.0.0.1:');
}

/**
 * Header hint only. Route screens render from IndexedDB while this ping runs.
 */
export function EngineStatusBadge() {
  const local = localEngine();
  const [phase, setPhase] = useState<Phase>('warming');

  useEffect(() => {
    if (!local) return;
    let cancelled = false;
    const ping = async () => {
      try {
        const res = await fetchWithTimeout(`${PROPOSAL_ENGINE_URL}/health`, { timeoutMs: 1500 });
        if (!res.ok) throw new Error('health');
        const body = (await res.json()) as { status?: string };
        if (cancelled) return;
        setPhase(body.status === 'warming' ? 'warming' : 'ready');
      } catch {
        if (!cancelled) setPhase('warming');
      }
    };
    void ping();
    const timer = window.setInterval(() => void ping(), phase === 'ready' ? 10_000 : 400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [local, phase]);

  if (!local) return null;

  return (
    <span
      data-testid="engine-status"
      className={`mr-3 hidden text-[11px] font-medium sm:inline ${
        phase === 'ready' ? 'text-black/40' : 'text-[#E22A12]'
      }`}
    >
      {phase === 'ready' ? 'Ready' : 'Engine warming…'}
    </span>
  );
}
