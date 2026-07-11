import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Linkedin } from 'lucide-react';

export type Lead = {
  id: number;
  name: string;
  email: string;
  code: string;
  designation: string;
  phone: string;
  joined: string;
  color: string;
  initials: string;
  linkedin?: string;
  sector: string;
  referenceNumber: string;
  source: string;
  company: string;
  companyLogo?: string;
};

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-b border-white/10 py-3 last:border-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-1 text-[13.5px] text-white/90">{value || '—'}</p>
    </div>
  );
}

export function LeadPanel({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  // false = circle (employee/lead avatar), true = square (company logo)
  const [showCompany, setShowCompany] = useState(false);

  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/60"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-[95] flex h-full w-full max-w-[420px] flex-col bg-[#0a0a0a] shadow-2xl ring-1 ring-white/10"
          >
            {/* header — diagonal split accent inspired by the reference card */}
            <div className="relative overflow-hidden px-7 pb-8 pt-7">
              <div
                className="absolute right-0 top-0 h-[160px] w-[160px] bg-[#2ecc71]/15"
                style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}
              />
              <button
                onClick={onClose}
                className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>

              <p className="relative z-10 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2ecc71]">
                Lead Profile
              </p>

              {/* toggle: square company logo  <->  circle lead avatar */}
              <div className="relative z-10 mt-5 flex items-center gap-4">
                <div className="relative h-20 w-20">
                  <AnimatePresence mode="wait" initial={false}>
                    {showCompany ? (
                      <motion.div
                        key="square"
                        initial={{ opacity: 0, scale: 0.7, rotate: -8, borderRadius: '50%' }}
                        animate={{ opacity: 1, scale: 1, rotate: 0, borderRadius: '16px' }}
                        exit={{ opacity: 0, scale: 0.7, rotate: 8, borderRadius: '50%' }}
                        transition={{ duration: 0.38, ease: 'easeInOut' }}
                        className="flex h-20 w-20 items-center justify-center bg-white/5 ring-1 ring-white/15"
                      >
                        {lead.companyLogo ? (
                          <img src={lead.companyLogo} alt={lead.company} className="h-full w-full rounded-[16px] object-cover" />
                        ) : (
                          <span className="text-[13px] font-bold text-white/70">
                            {lead.company
                              .split(' ')
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join('')}
                          </span>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="circle"
                        initial={{ opacity: 0, scale: 0.7, rotate: 8, borderRadius: '16px' }}
                        animate={{ opacity: 1, scale: 1, rotate: 0, borderRadius: '50%' }}
                        exit={{ opacity: 0, scale: 0.7, rotate: -8, borderRadius: '16px' }}
                        transition={{ duration: 0.38, ease: 'easeInOut' }}
                        className="flex h-20 w-20 items-center justify-center text-[20px] font-bold text-white"
                        style={{ backgroundColor: lead.color }}
                      >
                        {lead.initials}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[19px] font-bold text-white">{lead.name}</h2>
                  <p className="truncate text-[12.5px] text-white/40">{lead.designation}</p>

                  <button
                    onClick={() => setShowCompany((v) => !v)}
                    className="mt-2.5 flex items-center gap-2 rounded-full bg-white/5 px-1 py-1 ring-1 ring-white/10"
                    aria-label="Toggle logo / avatar"
                  >
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                        !showCompany ? 'bg-[#2ecc71] text-[#0a0a0a]' : 'text-white/40'
                      }`}
                    >
                      Lead
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                        showCompany ? 'bg-[#2ecc71] text-[#0a0a0a]' : 'text-white/40'
                      }`}
                    >
                      Company
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-7 pb-8">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">
                Basic Info
              </p>
              <Field label="Employee Code" value={lead.code} />
              <Field label="Designation" value={lead.designation} />
              <Field label="Phone Number" value={lead.phone} />
              <Field label="Joining Date" value={lead.joined} />

              <p className="mb-1 mt-6 text-[11px] font-semibold uppercase tracking-widest text-white/35">
                Lead Details
              </p>
              <Field label="Sector" value={lead.sector} />
              <Field label="Reference Number" value={lead.referenceNumber} />
              <Field label="Source" value={lead.source} />
              <div className="border-b border-white/10 py-3 last:border-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-widest text-white/35">LinkedIn</p>
                {lead.linkedin ? (
                  <a
                    href={lead.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] text-[#2ecc71] hover:underline"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    View profile
                  </a>
                ) : (
                  <p className="mt-1 text-[13.5px] text-white/90">—</p>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export default LeadPanel;
