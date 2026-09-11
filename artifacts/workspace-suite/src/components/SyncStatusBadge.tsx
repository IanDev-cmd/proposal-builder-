import { useSyncStatus } from '@/hooks/useSyncStatus';

export function SyncStatusBadge() {
  const snap = useSyncStatus();
  const title = [
    snap.lastSyncedAt
      ? `Last synced ${new Date(snap.lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : 'Not yet synced this session',
    snap.lastError ? snap.lastError : '',
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <span
      title={title}
      data-testid="sync-status"
      className={`mr-3 hidden text-[11px] font-medium sm:inline ${
        snap.label === 'Synced'
          ? 'text-black/40'
          : snap.label === 'Syncing...'
            ? 'text-[#2F7CF6]'
            : 'text-black/45'
      }`}
    >
      {snap.label}
    </span>
  );
}
