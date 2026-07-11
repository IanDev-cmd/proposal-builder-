import { AnimatePresence, motion } from 'framer-motion';
import { X, Play, ArrowLeft, ArrowRight, Facebook, Twitter, Linkedin } from 'lucide-react';

type Profile = {
  initials: string;
  name: string;
  role: string;
  photo: string;
};

const PROFILES: Profile[] = [
  {
    initials: 'AV',
    name: 'Alief Vinicius',
    role: 'Workspace Owner',
    photo:
      'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=600&auto=format&fit=crop',
  },
  {
    initials: 'SP',
    name: 'Samantha Price',
    role: 'Operations Lead',
    photo:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=600&auto=format&fit=crop',
  },
  {
    initials: 'MR',
    name: 'Marcus Reyes',
    role: 'Account Manager',
    photo:
      'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?q=80&w=600&auto=format&fit=crop',
  },
];

export function ProfileModal({
  open,
  index,
  onClose,
}: {
  open: boolean;
  index: number;
  onClose: () => void;
}) {
  const profile = PROFILES[index] ?? PROFILES[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[720px] overflow-hidden rounded-[10px] bg-[#0a0a0a] shadow-2xl ring-1 ring-white/10"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex min-h-[380px] items-center overflow-hidden">
              {/* split diagonal background: black on left, photo-bleed on right */}
              <div className="absolute inset-0 bg-[#0a0a0a]" />
              <div
                className="absolute inset-y-0 right-0 w-[62%]"
                style={{
                  clipPath: 'polygon(18% 0, 100% 0, 100% 100%, 0% 100%)',
                }}
              >
                <img src={profile.photo} alt={profile.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-transparent to-transparent" />
              </div>

              {/* content */}
              <div className="relative z-10 px-10 py-12">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2ecc71]">
                  {profile.role}
                </p>
                <h2 className="max-w-[280px] text-[30px] font-bold leading-[1.15] text-white">
                  {profile.name}
                </h2>
                <p className="mt-3 max-w-[260px] text-[13px] leading-relaxed text-white/50">
                  Good design is like a refrigerator—when it works, no one notices, but when it
                  doesn&apos;t, it sure stinks.
                </p>

                <button className="mt-6 inline-flex items-center gap-2 rounded-[4px] bg-[#2ecc71] px-5 py-2.5 text-[13px] font-semibold text-[#0a0a0a] transition-colors hover:bg-[#27af61]">
                  View Profile
                </button>

                <div className="mt-8 flex items-center gap-3 text-[11px] text-white/40">
                  <span>Share with</span>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/50">
                      <Facebook className="h-3 w-3" />
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/50">
                      <Twitter className="h-3 w-3" />
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-white/50">
                      <Linkedin className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </div>

              {/* circular portrait accent ring, matching the reference photo composition */}
              <div className="pointer-events-none absolute right-10 top-1/2 hidden h-[220px] w-[220px] -translate-y-1/2 rounded-full ring-1 ring-[#2ecc71]/60 sm:block" />

              {/* play + nav affordances */}
              <button className="absolute bottom-6 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-white text-[#0a0a0a] shadow-lg">
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              </button>
              <div className="absolute bottom-6 right-6 z-10 flex items-center gap-2">
                <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* profile switcher strip */}
            <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-[#0e0e0e] py-3">
              {PROFILES.map((p, i) => (
                <div
                  key={p.name}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === index ? 'bg-[#2ecc71]' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ProfileModal;
