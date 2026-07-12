import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Menu, Play, ChevronUp, ChevronDown, Mail, Phone, FileText, ArrowLeft, Send,
  Search, CircleDollarSign, Anchor, GitBranch, Clock, Tag as TagIcon,
} from 'lucide-react';
import { NOTE_CATEGORIES, detectTag, loadNotes, addNote, type NoteTag, type LeadNote } from '@/lib/leadNotes';
import { soundClick } from '@/lib/sounds';
import { personAvatarUrl, companyAvatarUrl } from '@/lib/avatar';

const NOTE_ICONS: Record<NoteTag, typeof Search> = {
  research: Search,
  calls: Phone,
  financial: CircleDollarSign,
  logistics: Anchor,
  pipeline: GitBranch,
  history: Clock,
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

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
  photoUrl?: string;
  status?: string;
};

/* ─── helpers ───
 * Real photos are resolved by pinging public identity services with the
 * data we actually have — email for the contact, LinkedIn for the company —
 * via the shared lib/avatar.ts helpers, with graceful fallbacks. */
const contactPhotoUrl = personAvatarUrl;
const companyLogoUrl = companyAvatarUrl;

/* ─── Contact View ─── */
function ContactView({ lead, onNotes }: { lead: Lead; onNotes: () => void }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="flex h-full w-full">
      {/* Left: cream panel */}
      <div className="relative flex w-1/2 flex-col bg-[#f0ece0] overflow-hidden">
        {/* Top nav */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-baseline gap-0.5">
            <span className="text-[15px] font-black tracking-tight text-[#1a1a1a]">Trend</span>
            <span className="text-[15px] font-black text-[#e63946]">.</span>
          </div>
          <nav className="flex items-center gap-4">
            {['Home', 'About', 'Contact'].map((link) => (
              <span key={link} className="text-[11px] font-medium text-[#1a1a1a]/60 hover:text-[#1a1a1a] cursor-pointer">
                {link}
              </span>
            ))}
          </nav>
          <div className="flex h-7 w-7 items-center justify-center bg-[#1a1a1a]">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white" />
          </div>
        </div>

        {/* Rotated side text */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#1a1a1a]/25 whitespace-nowrap select-none">
          Creativity — Vision — Excellence
        </div>

        {/* Content */}
        <div className="mt-auto px-10 pb-8 ml-4">
          <h2 className="text-[28px] font-black leading-[1.15] text-[#1a1a1a] tracking-tight">
            {lead.name.split(' ').slice(0, 1).join(' ')}<br />
            <span className="text-[#1a1a1a]/80">{lead.name.split(' ').slice(1).join(' ') || lead.designation}</span>
          </h2>
          <p className="mt-3 max-w-[200px] text-[11px] leading-relaxed text-[#1a1a1a]/50">
            {lead.designation} — {lead.sector}.{lead.source ? ` Sourced via ${lead.source}.` : ''}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 bg-[#1a1a1a] px-4 py-2 text-[11px] font-semibold text-white">
              <Mail className="h-3 w-3" /> Email
            </a>
            <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 border border-[#1a1a1a]/20 px-4 py-2 text-[11px] font-semibold text-[#1a1a1a]">
              <Phone className="h-3 w-3" /> Call
            </a>
            <button
              onClick={() => { onNotes(); soundClick(); }}
              className="flex items-center gap-1.5 border border-[#1a1a1a]/20 px-4 py-2 text-[11px] font-semibold text-[#1a1a1a] hover:border-[#2ecc71] hover:text-[#2ecc71] transition-colors"
            >
              <FileText className="h-3 w-3" /> Notes
            </button>
          </div>

          {/* Share row */}
          <div className="mt-5 flex items-center gap-2">
            <span className="text-[9.5px] font-semibold uppercase tracking-widest text-[#1a1a1a]/30">Share With :</span>
            {['f', 't', 'in'].map((s) => (
              <span key={s} className="flex h-5 w-5 items-center justify-center border border-[#1a1a1a]/20 text-[9px] font-bold text-[#1a1a1a]/40">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: dark panel — circle photo centred */}
      <div className="relative flex w-1/2 items-center justify-center bg-[#111] overflow-hidden">
        <div className="relative">
          <div className="h-52 w-52 overflow-hidden" style={{ borderRadius: '50%' }}>
            {imgErr ? (
              <div className="h-full w-full flex items-center justify-center bg-[#1a1a1a] text-white text-[32px] font-black">
                {lead.initials}
              </div>
            ) : (
              <img
                src={contactPhotoUrl(lead)}
                alt={lead.name}
                className="h-full w-full object-cover"
                onError={() => setImgErr(true)}
              />
            )}
          </div>
          {/* Play button at bottom of circle */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center bg-white shadow-lg">
            <Play className="h-3.5 w-3.5 fill-[#1a1a1a] text-[#1a1a1a]" />
          </div>
        </div>

        {/* Right edge nav dots */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-1.5 w-1.5 ${i === 1 ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>

        {/* Top-right controls */}
        <div className="absolute right-10 top-5 flex flex-col gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center border border-white/20 text-[10px] text-white/40">+</div>
          <div className="flex h-5 w-5 items-center justify-center border border-white/20 text-[10px] text-white/40">−</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Company View ─── */
function CompanyView({ lead }: { lead: Lead }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="flex h-full w-full">
      {/* Left: cream panel */}
      <div className="relative flex w-1/2 flex-col bg-[#f0ece0] overflow-hidden">
        {/* Top nav */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center border-2 border-[#1a1a1a]">
              <div className="h-2 w-2 bg-[#1a1a1a]" />
            </div>
            <span className="text-[13px] font-black tracking-tight text-[#1a1a1a]">
              {lead.company || 'Company'}<span className="text-[#1a1a1a]">.</span>
            </span>
          </div>
          <Menu className="h-4 w-4 text-[#1a1a1a]" />
        </div>

        {/* Rotated side text */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#1a1a1a]/25 whitespace-nowrap select-none">
          The Start
        </div>

        {/* Large watermark */}
        <div className="absolute right-6 top-10 text-[90px] font-black leading-none text-[#1a1a1a]/05 select-none pointer-events-none">
          {lead.id || '24'}
        </div>

        {/* Content */}
        <div className="mt-auto px-10 pb-8 ml-4">
          <h2 className="text-[32px] font-black leading-[1.1] text-[#1a1a1a] tracking-tight">
            The Story<span className="text-[#1a1a1a]">.</span>
          </h2>
          <p className="mt-3 max-w-[200px] text-[11px] leading-relaxed text-[#1a1a1a]/50">
            {lead.company} — {lead.sector}. Reference {lead.referenceNumber}. Joined {lead.joined}.
          </p>
          {lead.linkedin ? (
            <a
              href={lead.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-[#1a1a1a] underline underline-offset-2 cursor-pointer hover:text-[#2ecc71]"
            >
              View on LinkedIn
            </a>
          ) : (
            <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-[#1a1a1a] underline underline-offset-2 cursor-pointer hover:text-[#2ecc71]">
              Read More
            </div>
          )}

          {/* Social links */}
          <div className="mt-6 flex items-center gap-3 text-[9.5px] text-[#1a1a1a]/40">
            {['Facebook', 'Twitter', 'Behance'].map((s, i) => (
              <span key={s} className="flex items-center gap-3">
                <span className="hover:text-[#1a1a1a] cursor-pointer">{s}</span>
                {i < 2 && <span className="text-[#1a1a1a]/20">·</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right: dark panel — square photo centred at same equator as contact circle */}
      <div className="relative flex w-1/2 items-center justify-center bg-[#111] overflow-hidden">
        {/* Square photo */}
        <div className="h-52 w-52 overflow-hidden shrink-0">
          {imgErr ? (
            <div className="h-full w-full flex items-center justify-center bg-[#1a1a1a] text-white text-[11px] font-bold text-center p-4">
              {lead.company}
            </div>
          ) : (
            <img
              src={companyLogoUrl(lead)}
              alt={lead.company}
              className="h-full w-full object-cover"
              onError={() => setImgErr(true)}
            />
          )}
        </div>

        {/* Right edge up/down */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          <div className="flex h-7 w-7 items-center justify-center border border-white/20 text-white/50 hover:border-white/40 hover:text-white cursor-pointer">
            <ChevronUp className="h-3.5 w-3.5" />
          </div>
          <div className="flex h-7 w-7 items-center justify-center border border-white/20 text-white/50 hover:border-white/40 hover:text-white cursor-pointer">
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Note View: "Add a note" + tag categories + note history ─── */
function NoteView({ lead, onBack }: { lead: Lead; onBack: () => void }) {
  const leadKey = lead.referenceNumber !== '—' ? lead.referenceNumber : lead.email !== '—' ? lead.email : String(lead.id);
  const [text, setText] = useState('');
  const [manualTag, setManualTag] = useState<NoteTag | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>(() => loadNotes(leadKey));

  const detectedTag = manualTag ?? (text.trim() ? detectTag(text) : null);
  const detectedCat = detectedTag ? NOTE_CATEGORIES.find((c) => c.tag === detectedTag) ?? null : null;

  function handleSave() {
    if (!text.trim()) return;
    const note: LeadNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: text.trim(),
      tag: detectedTag,
      createdAt: new Date().toISOString(),
    };
    setNotes(addNote(leadKey, note));
    setText('');
    setManualTag(null);
    soundClick();
  }

  return (
    <div className="flex h-full w-full bg-white">
      {/* Left: composer */}
      <div className="flex w-1/2 flex-col border-r border-black/8 p-6 overflow-auto">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 self-start text-[12px] font-medium text-black/45 hover:text-black transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to profile
        </button>

        <h2 className="text-[19px] font-bold tracking-tight text-black">Add a note</h2>
        <p className="mt-0.5 text-[12px] text-black/40">{lead.name} · {lead.company}</p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Type naturally — e.g. "Repeat client, wants same as last year, next action: send updated quote by Friday"'
          className="mt-4 h-32 w-full resize-none border border-black/15 p-3 text-[12.5px] text-black/80 placeholder-black/30 outline-none transition-colors focus:border-[#2ecc71]"
        />

        <div className="mt-2 flex min-h-[18px] items-center gap-1.5">
          {detectedCat ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: detectedCat.color }}>
              {(() => { const Icon = NOTE_ICONS[detectedCat.tag]; return <Icon className="h-3 w-3" />; })()}
              Tagged as {detectedCat.hashtag}
            </span>
          ) : (
            <p className="text-[11px] italic text-black/35">
              Note types appear here as you type (or tag one yourself, e.g. #financial).
            </p>
          )}
        </div>

        {/* Taggable categories — large icons */}
        <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-wider text-black/35">Or tag it yourself</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {NOTE_CATEGORIES.map((cat) => {
            const Icon = NOTE_ICONS[cat.tag];
            const active = manualTag === cat.tag;
            return (
              <button
                key={cat.tag}
                onClick={() => { setManualTag(active ? null : cat.tag); soundClick(); }}
                title={cat.description}
                className={`flex flex-col items-center gap-1.5 border p-3 text-center transition-colors ${
                  active ? 'border-current bg-current/8' : 'border-black/10 hover:border-black/25'
                }`}
                style={active ? { color: cat.color } : undefined}
              >
                <Icon className="h-6 w-6" style={{ color: cat.color }} />
                <span className="text-[10px] font-semibold text-black/60">{cat.hashtag}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="mt-5 flex items-center justify-center gap-2 bg-[#2ecc71] py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#27af61] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> Save Note
        </button>
      </div>

      {/* Right: note history */}
      <div className="flex w-1/2 flex-col p-6 overflow-auto">
        <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-black/40">Note History</h3>

        {notes.length === 0 ? (
          <p className="mt-3 text-[12px] text-black/30">No notes yet for this lead.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {notes.map((n) => {
              const cat = n.tag ? NOTE_CATEGORIES.find((c) => c.tag === n.tag) ?? null : null;
              const Icon = cat ? NOTE_ICONS[cat.tag] : TagIcon;
              return (
                <div key={n.id} className="border border-black/8 p-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color: cat?.color ?? '#999' }} />
                    <span className="text-[10px] font-semibold" style={{ color: cat?.color ?? '#999' }}>
                      {cat?.hashtag ?? 'Untagged'}
                    </span>
                    <span className="ml-auto text-[10px] text-black/30">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-black/70">{n.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main export: centered overlay ─── */
export function LeadPanel({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const [view, setView] = useState<'contact' | 'company' | 'note'>('contact');

  useEffect(() => {
    if (lead) setView('contact');
  }, [lead?.id]);

  const showCompany = view === 'company';

  return (
    <AnimatePresence>
      {lead && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm"
          />

          {/* Centered panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="fixed left-1/2 top-1/2 z-[95] h-[500px] w-[860px] -translate-x-1/2 -translate-y-1/2 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* View content */}
            <AnimatePresence mode="wait" initial={false}>
              {view === 'note' ? (
                <motion.div
                  key="note"
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.32, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  <NoteView lead={lead} onBack={() => setView('contact')} />
                </motion.div>
              ) : view === 'company' ? (
                <motion.div
                  key="company"
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.32, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  <CompanyView lead={lead} />
                </motion.div>
              ) : (
                <motion.div
                  key="contact"
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.32, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  <ContactView lead={lead} onNotes={() => setView('note')} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toggle + close */}
            {view !== 'note' && (
              <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 bg-[#111]/80 px-3 py-1.5 backdrop-blur-sm">
                <button
                  onClick={() => setView('contact')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    !showCompany ? 'bg-[#2ecc71] text-[#0a0a0a]' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <div className="h-3 w-3 rounded-full border border-current" />
                  Contact
                </button>
                <button
                  onClick={() => setView('company')}
                  className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    showCompany ? 'bg-[#2ecc71] text-[#0a0a0a]' : 'text-white/40 hover:text-white'
                  }`}
                >
                  <div className="h-3 w-3 border border-current" />
                  Company
                </button>
              </div>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center bg-[#111]/60 text-white/60 backdrop-blur-sm hover:bg-[#111] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default LeadPanel;
