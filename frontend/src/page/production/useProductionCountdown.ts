import { useEffect, useState } from 'react';
import type { ProductionBatchRecord } from './productionApi';

/** Anchor to the server's remaining interval, then use a monotonic clock. The server still authorizes output. */
export default function useProductionCountdown(batch: ProductionBatchRecord | null) {
  const timing = batch?.timing;
  const [clock, setClock] = useState<{ timing: typeof timing; remaining: number } | null>(null);
  useEffect(() => {
    if (!timing) { setClock(null); return; }
    const anchor = performance.now(), initial = Math.max(0, timing.remaining_seconds);
    const tick = () => setClock({ timing, remaining: Math.max(0, Math.ceil(initial - (performance.now() - anchor) / 1000)) });
    tick(); const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [timing]);
  const remaining = clock?.timing === timing ? clock?.remaining ?? 0 : timing?.remaining_seconds ?? 0;
  const ready = !!timing && (timing.elapsed || (!!timing.production_started_at && remaining === 0));
  const duration = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  return { remaining, duration, ready };
}
