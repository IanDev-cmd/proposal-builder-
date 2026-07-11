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

function MapIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6,10 18,6 30,10 42,6 42,38 30,42 18,38 6,42" />
      <line x1="18" y1="6" x2="18" y2="38" />
      <line x1="30" y1="10" x2="30" y2="42" />
      <circle cx="24" cy="22" r="3" />
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
      <rect x="10" y="4" width="28" height="36" rx="2" />
      <line x1="16" y1="14" x2="32" y2="14" />
      <line x1="16" y1="20" x2="32" y2="20" />
      <line x1="16" y1="26" x2="24" y2="26" />
      <path d="M28 32l4 4 8-8" />
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
  { id: 0, label: 'Prospect', Icon: HandshakeIcon },
  { id: 1, label: 'Tour',     Icon: MapIcon },
  { id: 2, label: 'Offer',    Icon: OfferIcon },
  { id: 3, label: 'Contract', Icon: ContractIcon },
  { id: 4, label: 'Settled',  Icon: HouseIcon },
];

const ACTIVE_STEP = 2; // Offer

/* ─────────── sub-components ─────────── */

function TimelineTrack({
  activeStep,
  dark = false,
  compact = false,
}: {
  activeStep: number;
  dark?: boolean;
  compact?: boolean;
}) {
  const iconSize = compact ? 32 : 42;
  const nodeSize = compact ? 26 : 32;
  const labelSize = compact ? 'text-[11px]' : 'text-[13px]';
  const trackColor = dark ? '#6b7a8a' : '#d1d5db';
  const doneColor = '#2ecc71';

  return (
    <div className="flex items-start justify-between w-full relative" style={{ gap: 0 }}>
      {STEPS.map((step, i) => {
        const done = i < activeStep;
        const active = i === activeStep;
        const pending = i > activeStep;

        return (
          <div key={step.id} className="flex flex-col items-center flex-1 relative">
            {/* connector line left */}
            {i > 0 && (
              <div
                className="absolute top-0 right-[50%] h-[2px]"
                style={{
                  width: '100%',
                  top: compact
                    ? `${iconSize + 14}px`
                    : `${iconSize + 18}px`,
                  backgroundColor: i <= activeStep ? doneColor : trackColor,
                  zIndex: 0,
                }}
              />
            )}

            {/* icon */}
            <div style={{ width: iconSize, height: iconSize }} className="mb-3 relative z-10">
              <step.Icon
                color={
                  done ? '#9ca3af'
                  : active ? doneColor
                  : dark ? '#6b7a8a'
                  : '#9ca3af'
                }
              />
            </div>

            {/* circle node */}
            <div className="relative z-10 flex items-center justify-center" style={{ width: nodeSize, height: nodeSize }}>
              {done ? (
                <motion.div
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  className="rounded-full bg-[#2ecc71] flex items-center justify-center"
                  style={{ width: nodeSize, height: nodeSize }}
                >
                  <Check className="text-white" style={{ width: nodeSize * 0.45, height: nodeSize * 0.45 }} strokeWidth={3} />
                </motion.div>
              ) : active ? (
                <div className="relative flex items-center justify-center" style={{ width: nodeSize, height: nodeSize }}>
                  {/* outer ring */}
                  <div
                    className="absolute rounded-full border-[2.5px] border-[#2ecc71] bg-white"
                    style={{ width: nodeSize, height: nodeSize }}
                  />
                  {/* inner dot */}
                  <motion.div
                    animate={{ scale: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="rounded-full bg-[#2ecc71]"
                    style={{ width: nodeSize * 0.38, height: nodeSize * 0.38 }}
                  />
                </div>
              ) : (
                <div
                  className="rounded-full border-[2px]"
                  style={{
                    width: nodeSize * 0.55,
                    height: nodeSize * 0.55,
                    borderColor: dark ? '#6b7a8a' : '#d1d5db',
                    backgroundColor: dark ? '#4f5f6e' : 'white',
                  }}
                />
              )}
            </div>

            {/* label */}
            <span
              className={`mt-2 font-medium ${labelSize} ${
                active
                  ? 'text-[#2ecc71]'
                  : done
                  ? dark ? 'text-gray-400' : 'text-gray-400'
                  : dark ? 'text-gray-400' : 'text-gray-400'
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
    <div className="min-h-[calc(100vh-4rem)] w-full bg-white flex flex-col">

      {/* ── light section ── */}
      <div className="flex flex-col items-center justify-center flex-1 px-12 pt-14 pb-10">
        <motion.h1
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[32px] font-bold text-gray-800 mb-14 tracking-tight"
        >
          Process Timeline
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="w-full max-w-[640px]"
        >
          <TimelineTrack activeStep={ACTIVE_STEP} />
        </motion.div>
      </div>

      {/* ── dark section ── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.22 }}
        className="w-full bg-[#4f5f6e] px-12 py-10"
      >
        <div className="flex items-center gap-12 max-w-[900px] mx-auto">
          {/* timeline */}
          <div className="flex-1">
            <p className="text-white text-[13px] font-semibold mb-8">Alternative Dark Mode</p>
            <TimelineTrack activeStep={ACTIVE_STEP} dark compact />
          </div>

          {/* email + CTA */}
          <div className="flex flex-col gap-3 shrink-0">
            <div className="flex items-center gap-2.5 border border-[#6b7a8a] rounded-[4px] px-3 py-2.5 bg-transparent min-w-[200px]">
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
              className="bg-[#2ecc71] hover:bg-[#27af61] text-white text-[13px] font-semibold px-5 py-2.5 rounded-[4px] transition-colors"
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
