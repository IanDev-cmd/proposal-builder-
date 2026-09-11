import { useEffect, useState } from 'react';
import { getSyncSnapshot, subscribeSyncStatus, type SyncSnapshot } from '@/lib/syncManager';

export function useSyncStatus(): SyncSnapshot {
  const [snap, setSnap] = useState<SyncSnapshot>(() => getSyncSnapshot());
  useEffect(() => subscribeSyncStatus(() => setSnap(getSyncSnapshot())), []);
  return snap;
}
