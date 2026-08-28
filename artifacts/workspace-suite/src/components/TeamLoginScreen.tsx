import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock } from 'lucide-react';
import { loginTeamPin, PIN_LENGTH } from '@/lib/teamSession';

type Status = 'idle' | 'auth' | 'success' | 'error';

type Props = {
  onUnlocked: () => void;
};

const emptyPin = () => Array.from({ length: PIN_LENGTH }, () => '');

export function TeamLoginScreen({ onUnlocked }: Props) {
  const [digits, setDigits] = useState<string[]>(emptyPin);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const setDigit = (index: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError('');
    if (status === 'error') setStatus('idle');
    if (char && index < PIN_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (char && index === PIN_LENGTH - 1 && next.every((d) => d)) {
      void submitPin(next.join(''));
    }
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitPin(digits.join(''));
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (!pasted) return;
    const next = emptyPin();
    pasted.split('').forEach((ch, i) => {
      next[i] = ch;
    });
    setDigits(next);
    inputs.current[Math.min(pasted.length, PIN_LENGTH) - 1]?.focus();
    if (pasted.length === PIN_LENGTH) void submitPin(pasted);
  };

  const submitPin = async (pin: string) => {
    if (status === 'auth' || status === 'success') return;
    setStatus('auth');
    setError('');
    const result = await loginTeamPin(pin);
    if (!result.ok) {
      setStatus('error');
      setDigits(emptyPin());
      inputs.current[0]?.focus();
      setError(
        result.reason === 'locked'
          ? 'Too many attempts. Try again later.'
          : result.reason === 'network'
            ? 'Could not reach the server. Try again.'
            : 'Incorrect PIN. Try again.',
      );
      return;
    }
    setStatus('success');
    await wait(1100);
    onUnlocked();
  };

  return (
    <div className="team-login-page">
      <motion.div
        className={`team-login-card ${status}`}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={
          status === 'success'
            ? { opacity: 1, y: 0, scale: 1.02 }
            : status === 'error'
              ? { opacity: 1, x: [0, -10, 10, -8, 8, 0], y: 0, scale: 1 }
              : { opacity: 1, y: 0, scale: 1 }
        }
        transition={{ duration: status === 'error' ? 0.45 : 0.45, ease: 'easeOut' }}
      >
        <div className="team-login-dark">
          <h1>WELCOME BACK!</h1>
          <p>
            Enter the shared six-digit team PIN to open Nexus. The session stays on this tab and
            signs out after two hours of inactivity.
          </p>
        </div>

        <form
          className="team-login-light"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onSubmit={(e) => {
            e.preventDefault();
            void submitPin(digits.join(''));
          }}
        >
          <h2>Login</h2>
          <span className="team-login-rule" aria-hidden />

          <label className="team-login-label" htmlFor="team-pin-0">
            Password
          </label>
          <div className="team-pin-row">
            {digits.map((digit, i) => (
              <input
                key={i}
                id={`team-pin-${i}`}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                className="team-pin-box"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={1}
                value={digit}
                disabled={status === 'auth' || status === 'success'}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={onPaste}
                aria-label={`PIN digit ${i + 1}`}
              />
            ))}
            <Lock className="team-pin-lock" size={16} strokeWidth={2} aria-hidden />
          </div>

          {error ? <p className="team-login-error">{error}</p> : <p className="team-login-hint">Six-digit team PIN</p>}

          <button type="submit" className="team-login-btn" disabled={status === 'auth' || status === 'success'}>
            {status === 'auth' ? 'Checking…' : status === 'success' ? 'Welcome' : 'Login'}
          </button>

          <button
            type="button"
            className="team-login-reset"
            onClick={() => setShowReset(true)}
          >
            Contact Developer
          </button>
          {showReset ? (
            <p className="team-login-reset-msg">
              To reset the team PIN, contact the developer. Reset is not available in this app.
            </p>
          ) : null}
        </form>

        <AnimatePresence>
          {status === 'success' ? (
            <motion.div
              className="team-login-success"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            >
              <span className="team-login-success-ring">
                <Check size={34} strokeWidth={2.6} />
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
