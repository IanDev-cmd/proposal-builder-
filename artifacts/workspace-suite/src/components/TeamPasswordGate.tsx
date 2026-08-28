import { useEffect, useState, type ReactNode } from 'react';
import { TeamLoginScreen } from '@/components/TeamLoginScreen';
import {
  TEAM_AUTH_EXPIRED_EVENT,
  TEAM_IDLE_MS,
  clearTeamSession,
  isTeamSessionActive,
  restoreTeamSession,
  touchTeamSession,
} from '@/lib/teamSession';

export function TeamPasswordGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void restoreTeamSession().then((ok) => {
      if (cancelled) return;
      setUnlocked(ok);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      clearTeamSession();
      setUnlocked(false);
    };
    window.addEventListener(TEAM_AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(TEAM_AUTH_EXPIRED_EVENT, onExpired);
  }, []);

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

  if (!ready) {
    return <div className="team-login-page" aria-busy="true" />;
  }

  if (!unlocked) {
    return (
      <TeamLoginScreen
        onUnlocked={() => {
          setUnlocked(true);
        }}
      />
    );
  }

  return <>{children}</>;
}
