import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { TeamLoginScreen } from '@/components/TeamLoginScreen';
import { HOME_PATH } from '@/lib/homeLanding';
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
  const [, setLocation] = useLocation();

  const landOnHome = useCallback(() => {
    setLocation(HOME_PATH, { replace: true });
  }, [setLocation]);

  const lockToHome = useCallback(() => {
    clearTeamSession();
    landOnHome();
    setUnlocked(false);
  }, [landOnHome]);

  useEffect(() => {
    let cancelled = false;
    void restoreTeamSession().then((ok) => {
      if (cancelled) return;
      if (ok) landOnHome();
      setUnlocked(ok);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [landOnHome]);

  useEffect(() => {
    window.addEventListener(TEAM_AUTH_EXPIRED_EVENT, lockToHome);
    return () => window.removeEventListener(TEAM_AUTH_EXPIRED_EVENT, lockToHome);
  }, [lockToHome]);

  useEffect(() => {
    if (!unlocked) return;

    const onActivity = () => touchTeamSession();
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const tick = window.setInterval(() => {
      if (!isTeamSessionActive()) lockToHome();
    }, 15_000);

    const idle = window.setTimeout(() => {
      if (!isTeamSessionActive()) lockToHome();
    }, TEAM_IDLE_MS);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(tick);
      window.clearTimeout(idle);
    };
  }, [unlocked, lockToHome]);

  if (!ready) {
    return <div className="team-login-page" aria-busy="true" />;
  }

  if (!unlocked) {
    return (
      <TeamLoginScreen
        onUnlocked={() => {
          landOnHome();
          setUnlocked(true);
        }}
      />
    );
  }

  return <>{children}</>;
}
