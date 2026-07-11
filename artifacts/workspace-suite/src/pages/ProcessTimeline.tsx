import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Mail } from 'lucide-react';

/* ─────────── icons (SVG outlines matching the design) ─────────── */

function HandshakeIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18l10-6h8l10 6" />
      <path d="M4 22c0 0 2-4 6-4s6 2 6 2l8 8s2 2 4 0 0-4 0-4" />
      <path d="M28 24l6-6s2-2 4 0 0 4 0 4l-8 8s-2 2-4 0" />
      <path d="M44 22c0 0-2-4-6-4" />
      <path d="M16 32l-6 8" />
      <path d="M32 32l6 8" />
    </svg>
  );
}

function FormSignedIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="4" width="28" height="36" rx="2" />
      <line x1="16" y1="14" x2="32" y2="14" />
      <line x1="16" y1="20" x2="32" y2="20" />
      <line x1="16" y1="26" x2="24" y2="26" />
      <path d="M28 32l4 4 8-8" />
    </svg>
  );
}

function OfferIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="6" width="28" height="36" rx="2" />
      <path d="M24 14v20M18 20l6-6 6 6" />
      <line x1="16" y1="34" x2="32" y2="34" />
    </svg>
  );
}

function ContractIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h14l8 8v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M28 4v8h8" />
      <path d="M17 26l4 4 10-10" />
    </svg>
  );
}

function HouseIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 24L24 8l18 16" />
      <path d="M10 20v20h10V30h8v10h10V20" />
      <circle cx="38" cy="16" r="3" fill={color === '#2ecc71' ? '#2ecc71' : 'none'} />
    </svg>
  );
}

/* ─────────── step data ─────────── */

const STEPS = [
  { id: 0, label: 'Lead Received', Icon: HandshakeIcon },
  { id: 1, label: 'Booking Form Signed', Icon: FormSignedIcon },
  { id: 2, label: 'Deposit Paid', Icon: OfferIcon },
  { id: 3, label: 'Contract Signed', Icon: ContractIcon },
  { id: 4, label: 'Job Confirmed', Icon: HouseIcon },
];

const ACTIVE_STEP = 2; // Deposit Paid

/* ─────────── sub-components ─────────── */

const ICON_SIZE = 38;
const NODE_SIZE = 28;
const ICON_MARGIN = 14; // px gap between icon and node (mb-3.5 equivalent)
// The connector line must cross exactly through the vertical center of each node.
const LINE_TOP = ICON_SIZE + ICON_MARGIN + NODE_SIZE / 2;

function TimelineTrack({ activeStep }: { activeStep: number }) {
  const trackColor = '#6b7a8a';
  const doneColor = '#2ecc71';

  return (
    <div className="flex items-start justify-between w-full relative" style={{ gap: '8px' }}>
      {STEPS.map((step, i) => {
        const done = i < activeStep;
        const active = i === activeStep;

        return (
          <div
            key={step.id}
            className="flex flex-col items-center relative"
            style={{ flex: '1 1 0', minWidth: 150 }}
          >
            {/* connector line — passes through the exact center of the circle nodes */}
            {i > 0 && (
              <div
                className="absolute h-[2px]"
                style={{
                  right: '50%',
                  width: '100%',
                  top: `${LINE_TOP}px`,
                  backgroundColor: i <= activeStep ? doneColor : trackColor,
                  zIndex: 0,
                }}
              />
            )}

            {/* icon */}
            <div style={{ width: ICON_SIZE, height: ICON_SIZE, marginBottom: ICON_MARGIN }} className="relative z-10">
              <step.Icon color={done ? '#9ca3af' : active ? doneColor : '#6b7a8a'} />
            </div>

            {/* circle node */}
            <div className="relative z-10 flex items-center justify-center" style={{ width: NODE_SIZE, height: NODE_SIZE }}>
              {done ? (
                <motion.div
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  className="rounded-full bg-[#2ecc71] flex items-center justify-center"
                  style={{ width: NODE_SIZE, height: NODE_SIZE }}
                >
                  <Check className="text-[#0a0a0a]" style={{ width: NODE_SIZE * 0.45, height: NODE_SIZE * 0.45 }} strokeWidth={3} />
                </motion.div>
              ) : active ? (
                <div className="relative flex items-center justify-center" style={{ width: NODE_SIZE, height: NODE_SIZE }}>
                  <div
                    className="absolute rounded-full border-[2.5px] border-[#2ecc71] bg-[#4f5f6e]"
                    style={{ width: NODE_SIZE, height: NODE_SIZE }}
                  />
                  <motion.div
                    animate={{ scale: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="rounded-full bg-[#2ecc71]"
                    style={{ width: NODE_SIZE * 0.38, height: NODE_SIZE * 0.38 }}
                  />
                </div>
              ) : (
                <div
                  className="rounded-full border-[2px]"
                  style={{
                    width: NODE_SIZE * 0.55,
                    height: NODE_SIZE * 0.55,
                    borderColor: '#6b7a8a',
                    backgroundColor: '#4f5f6e',
                  }}
                />
              )}
            </div>

            {/* label — generous min-width above keeps every step on a single line */}
            <span
              className={`mt-3 font-medium text-[13px] text-center whitespace-nowrap ${
                active ? 'text-[#2ecc71]' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────── main page ─────────── */

export function ProcessTimeline() {
  const [email, setEmail] = useState('');

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-[980px] rounded-[14px] bg-[#4f5f6e] px-12 py-12 shadow-2xl ring-1 ring-white/10"
      >
        <p className="text-white text-[13px] font-semibold mb-10 text-center tracking-wide">
          Alternative Dark Mode
        </p>

        <TimelineTrack activeStep={ACTIVE_STEP} />

        <div className="mt-12 flex flex-col items-center gap-3 border-t border-white/10 pt-8">
          <p className="text-white/60 text-[12px]">Get notified the moment this lead moves to the next stage</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 border border-[#6b7a8a] rounded-[4px] px-3 py-2.5 bg-transparent min-w-[240px]">
              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter Email"
                className="flex-1 bg-transparent text-[13px] text-gray-300 placeholder-gray-500 outline-none"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="bg-[#2ecc71] hover:bg-[#27af61] text-[#0a0a0a] text-[13px] font-semibold px-5 py-2.5 rounded-[4px] transition-colors"
            >
              Get Notifications
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default ProcessTimeline;
