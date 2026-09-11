import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { TeamLoginScreen } from '@/components/TeamLoginScreen';
import { HOME_PATH, isShareDeepLink } from '@/lib/homeLanding';
import {
  TEAM_AUTH_EXPIRED_EVENT,
  TEAM_IDLE_MS,
  clearTeamSession,
  isTeamSessionActive,
  restoreTeamSession,
  touchTeamSession,
} from '@/lib/teamSession';
import { startWorkspaceCloudSync } from '@/lib/workspaceSync';
import { startWorkbookSync } from '@/lib/workbookSync';

export function TeamPasswordGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [location, setLocation] = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  const landOnHome = useCallback(() => {
    setLocation(HOME_PATH, { replace: true });
  }, [setLocation]);

  const landAfterAuth = useCallback(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    if (isShareDeepLink(locationRef.current, search)) return;
    landOnHome();
  }, [landOnHome]);

  const lockToHome = useCallback(() => {
    clearTeamSession();
    landOnHome();
    setUnlocked(false);
  }, [landOnHome]);

  useEffect(() => {
    let cancelled = false;
    void restoreTeamSession().then((ok) => {
      if (cancelled) return;
      if (ok) landAfterAuth();
      setUnlocked(ok);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [landAfterAuth]);

  useEffect(() => {
    window.addEventListener(TEAM_AUTH_EXPIRED_EVENT, lockToHome);
    return () => window.removeEventListener(TEAM_AUTH_EXPIRED_EVENT, lockToHome);
  }, [lockToHome]);

  useEffect(() => {
    if (!unlocked) return;
    startWorkspaceCloudSync();
    startWorkbookSync();

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
          landAfterAuth();
          setUnlocked(true);
        }}
      />
    );
  }

  return <>{children}</>;
}
