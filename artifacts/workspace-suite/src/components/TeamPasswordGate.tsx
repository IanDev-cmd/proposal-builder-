import { useEffect, useState, type ReactNode } from 'react';
import { TeamLoginScreen } from '@/components/TeamLoginScreen';
import {
  clearTeamSession,
  isTeamSessionActive,
  startTeamSession,
  TEAM_IDLE_MS,
  touchTeamSession,
} from '@/lib/teamSession';

export function TeamPasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => isTeamSessionActive());

  useEffect(() => {
    if (!unlocked) return;

    const onActivity = () => touchTeamSession();
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const tick = window.setInterval(() => {
      if (!isTeamSessionActive()) {
        clearTeamSession();
        setUnlocked(false);
      }
    }, 15_000);

    const idle = window.setTimeout(() => {
      if (!isTeamSessionActive()) {
        clearTeamSession();
        setUnlocked(false);
      }
    }, TEAM_IDLE_MS);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(tick);
      window.clearTimeout(idle);
    };
  }, [unlocked]);

  if (!unlocked) {
    return (
      <TeamLoginScreen
        onUnlocked={() => {
          startTeamSession();
          setUnlocked(true);
        }}
      />
    );
  }

  return <>{children}</>;
}
