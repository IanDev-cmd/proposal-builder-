import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid2x2, FileText, PenSquare, CheckCircle2, MessageSquareText, Star,
  MoreVertical, Search, LayoutGrid, List, Share2, Pencil, Trash2,
  ChevronRight, Home as HomeIcon, Download, Printer, X, ChevronUp, ChevronDown,
  FileIcon as FileGeneratedIcon, MousePointerClick,
  Wallet, Anchor, UtensilsCrossed, CalendarCheck, Users, Sparkles, Hash,
} from 'lucide-react';
import { loadProposals, subscribeProposals, type GeneratedProposal } from '@/lib/proposalStore';

/* ─── Real document pages from the uploaded PDF ─── */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const pageImg = (n: number) => `${BASE}/doc-pages/page_${String(n).padStart(2, '0')}.png`;

type FileKind = 'page' | 'draft' | 'generated';

type ProposalFile = {
  id: string;
  title: string;
  kind: FileKind;
  pageNum?: number;
  section?: string;
  sizeLabel: string;
  description: string;
  pdfDataUrl?: string;
};

/** Maps a webhook-generated proposal (from the Forms wizard) into a file card. */
function proposalToFile(p: GeneratedProposal): ProposalFile {
  return {
    id: p.id,
    title: p.title,
    kind: 'generated',
    sizeLabel: 'PDF',
    description: `Generated for ${p.guestCount || '—'} guests aboard ${p.vesselType || 'a vessel TBC'}. Grand total £${p.grandTotal.toFixed(2)}.`,
    pdfDataUrl: p.pdfDataUrl,
  };
}

/* ─── Real content: 18 document pages + 3 drafts, as "files" ─── */
const DOC_PAGES: ProposalFile[] = [
  { id: 'p1',  title: 'Our Proposal',                   kind: 'page', pageNum: 1,  sizeLabel: '2.4 MB', description: 'Cover page introducing the proposal to the client.' },
  { id: 'p2',  title: 'Contents',                        kind: 'page', pageNum: 2,  sizeLabel: '1.1 MB', description: 'Full table of contents for the proposal document.' },
  { id: 'p3',  title: 'About Us',                        kind: 'page', pageNum: 3,  sizeLabel: '2.0 MB', description: 'Company background and history.' },
  { id: 'p4',  title: 'Our Mission',                     kind: 'page', pageNum: 4,  sizeLabel: '1.8 MB', description: 'Mission statement and core values.' },
  { id: 'p5',  title: 'Why West End on the Thames?',     kind: 'page', pageNum: 5,  sizeLabel: '2.6 MB', description: 'What sets our vessels and service apart.' },
  { id: 'p6',  title: 'Your Assigned Team',               kind: 'page', pageNum: 6,  sizeLabel: '2.2 MB', description: 'Meet the team assigned to this booking.' },
  { id: 'p7',  title: 'Testimonials',                     kind: 'page', pageNum: 7,  sizeLabel: '1.5 MB', description: 'Feedback from past clients.' },
  { id: 'p8',  title: 'Statement',                        kind: 'page', pageNum: 8,  sizeLabel: '900 KB', description: 'Formal statement for this proposal.' },
  { id: 'p9',  title: 'Vessel Details',                   kind: 'page', pageNum: 9,  sizeLabel: '3.1 MB', description: 'Specifications for the selected vessel.' },
  { id: 'p10', title: 'Catering',                         kind: 'page', pageNum: 10, sizeLabel: '2.7 MB', description: 'Menu options and catering details.' },
  { id: 'p11', title: 'River Map',                        kind: 'page', pageNum: 11, sizeLabel: '3.4 MB', description: 'Route map along the Thames.' },
  { id: 'p12', title: 'Instagram',                        kind: 'page', pageNum: 12, sizeLabel: '2.9 MB', description: 'Social media highlights and gallery.' },
  { id: 'p13', title: 'Your Bespoke Package',             kind: 'page', pageNum: 13, sizeLabel: '2.3 MB', description: 'Package tailored to this client\u2019s event.' },
  { id: 'p14', title: 'Added Extras',                     kind: 'page', pageNum: 14, sizeLabel: '1.6 MB', description: 'Optional add-ons available for booking.' },
  { id: 'p15', title: 'Booking Procedure & Event Prep',   kind: 'page', pageNum: 15, sizeLabel: '1.2 MB', description: 'Steps and timeline to confirm the booking.' },
  { id: 'p16', title: 'Your Contact',                     kind: 'page', pageNum: 16, sizeLabel: '800 KB', description: 'Direct contact details for this proposal.' },
  { id: 'p17', title: 'Google Reviews',                   kind: 'page', pageNum: 17, sizeLabel: '1.4 MB', description: 'Aggregated review scores and highlights.' },
  { id: 'p18', title: 'Land Venue Option',                kind: 'page', pageNum: 18, sizeLabel: '2.1 MB', description: 'Alternative land-based venue option.' },
];

const DRAFTS: ProposalFile[] = [
  {
    id: 'd1', title: 'Cover Letter', kind: 'draft', section: 'Section 1', sizeLabel: '12 KB',
    description: 'Thank you for your enquiry into chartering a West End on the Thames vessel for your upcoming event. Please let me know if you would like any details amended.',
  },
  {
    id: 'd2', title: 'Bespoke Package', kind: 'draft', section: 'Section 2', sizeLabel: '18 KB',
    description: 'Your bespoke package includes full venue hire, professional photographers, personalised playlist, summer garden games, décor, food & beverages, and full event management. £4,000 — 50 guests.',
  },
  {
    id: 'd3', title: 'Booking Procedure', kind: 'draft', section: 'Section 3', sizeLabel: '9 KB',
    description: 'Initial proposal sent within 24hrs. Follow-up call within 48hrs. Booking form issued after confirmation. 20% deposit secures the date. Balance due 21 days prior.',
  },
];

const ALL_FILES: ProposalFile[] = [...DRAFTS, ...DOC_PAGES];

/* ─── Left icon rail (mirrors the previous top tabs) ─── */
const RAIL_ITEMS = [
  { icon: Grid2x2,           label: 'All Files' },
  { icon: FileText,          label: 'Pricing'   },
  { icon: PenSquare,         label: 'Drafts'    },
  { icon: CheckCircle2,      label: 'Signed'    },
  { icon: MessageSquareText, label: 'Notes'     },
];

/* ─── Taggable note categories — shown as large icon tiles on the Notes tab ─── */
const NOTE_CATEGORIES = [
  { tag: 'financials', label: 'Financials', icon: Wallet,          color: '#e8b93f' },
  { tag: 'vessel',     label: 'Vessel',      icon: Anchor,         color: '#2ecc71' },
  { tag: 'catering',   label: 'Catering',    icon: UtensilsCrossed, color: '#ef6f6f' },
  { tag: 'booking',    label: 'Booking',     icon: CalendarCheck,  color: '#5b8def' },
  { tag: 'client',     label: 'Client',      icon: Users,          color: '#a06fef' },
  { tag: 'upgrades',   label: 'Upgrades',    icon: Sparkles,       color: '#27af61' },
];

const KIND_COLORS: Record<FileKind, string> = {
  page: '#2ecc71',
  draft: '#27af61',
  generated: '#e8b93f',
};

function FileIcon({ file }: { file: ProposalFile }) {
  if (file.kind === 'page' && file.pageNum) {
    return (
      <div className="h-14 w-11 overflow-hidden rounded-[4px] bg-white shadow-sm ring-1 ring-black/10">
        <img src={pageImg(file.pageNum)} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className="flex h-14 w-11 items-center justify-center rounded-[4px] text-white"
      style={{ backgroundColor: KIND_COLORS[file.kind] }}
    >
      {file.kind === 'generated' ? <FileGeneratedIcon className="h-5 w-5" /> : <PenSquare className="h-5 w-5" />}
    </div>
  );
}

/* ─── File Card ─── */
function FileCard({
  file, active, starred, onToggleStar, onClick,
}: {
  file: ProposalFile;
  active: boolean;
  starred: boolean;
  onToggleStar: () => void;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col gap-3 rounded-[14px] p-4 text-left transition-all ${
        active ? 'bg-[#eefdf3] ring-2 ring-[#2ecc71]' : 'bg-[#faf9f4] hover:bg-[#f3f2ea]'
      }`}
    >
      <div className="flex items-start justify-between">
        <span
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            starred ? 'text-[#e8b93f]' : 'text-black/15 hover:text-black/35'
          }`}
        >
          <Star className="h-4 w-4" fill={starred ? '#e8b93f' : 'none'} />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full text-black/25 hover:text-black/50">
          <MoreVertical className="h-4 w-4" />
        </span>
      </div>

      <FileIcon file={file} />

      <div>
        <p className="truncate text-[13px] font-semibold text-black/80">{file.title}</p>
        <p className="mt-1 text-[10.5px] text-black/35">Filesize: {file.sizeLabel}</p>
      </div>
    </button>
  );
}

/* ──────────────────────── Main export ──────────────────────── */
export function ProposalDoc() {
  const [railIndex, setRailIndex] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set(['d2']));
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeNoteTag, setActiveNoteTag] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedProposal[]>(() => loadProposals());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeProposals(() => setGenerated(loadProposals())), []);

  // Auto-select and open the newest generated proposal the moment it lands here
  // (e.g. arriving fresh from the Forms wizard).
  const generatedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newest = generated[0];
    if (newest && !generatedIds.current.has(newest.id)) {
      generatedIds.current.add(newest.id);
      if (generatedIds.current.size === generated.length) return; // first load, don't auto-open
      setActiveId(newest.id);
      setRailIndex(0);
    } else {
      generated.forEach((p) => generatedIds.current.add(p.id));
    }
  }, [generated]);

  const generatedFiles = generated.map(proposalToFile);
  const allFilesWithGenerated: ProposalFile[] = [...generatedFiles, ...ALL_FILES];

  const active = allFilesWithGenerated.find((f) => f.id === activeId) ?? null;

  const isNotesTab = railIndex === 4;

  const files =
    railIndex === 2 ? DRAFTS
    : railIndex === 0 ? allFilesWithGenerated
    : allFilesWithGenerated; // Pricing / Signed reuse the same file set for now

  const toggleStar = (id: string) =>
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleDownload = () => {
    if (!active) return;
    if (active.kind === 'generated' && active.pdfDataUrl) {
      const a = document.createElement('a');
      a.href = active.pdfDataUrl;
      a.download = `${active.title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      a.click();
      return;
    }
    if (active.kind !== 'page' || !active.pageNum) return;
    const a = document.createElement('a');
    a.href = pageImg(active.pageNum);
    a.download = `proposal-${active.title.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const scrollGrid = (dir: 1 | -1) => {
    gridRef.current?.scrollBy({ top: dir * 260, behavior: 'smooth' });
  };

  return (
    <div className="flex bg-white" style={{ minHeight: 'calc(100vh - 4rem)' }}>

      {/* ══ LEFT ICON RAIL ══ */}
      <aside className="sticky top-16 flex h-[calc(100vh-4rem)] w-[68px] shrink-0 flex-col items-center gap-2 border-r border-black/8 bg-[#219251] py-6">
        <span className="mb-6 flex h-9 w-9 items-center justify-center rounded-[8px] bg-white text-[13px] font-bold text-[#219251]">
          N
        </span>
        {RAIL_ITEMS.map(({ icon: Icon, label }, i) => {
          const isActive = railIndex === i;
          return (
            <div key={label} className="relative flex w-full items-center justify-center py-1.5">
              {isActive && <span className="absolute left-0 h-6 w-[3px] rounded-r-full bg-white" />}
              <button
                onClick={() => setRailIndex(i)}
                title={label}
                className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white/85'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            </div>
          );
        })}
      </aside>

      {/* ══ CENTER: header + file grid ══ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <div className="flex items-center justify-between border-b border-black/8 px-8 py-3.5">
          <div>
            <h1 className="text-[22px] font-bold text-black">Catering Services Proposal</h1>
            <p className="mt-0.5 text-[11.5px] text-black/35">Proposals · Hospitality Sector · WE.9055</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-black transition-colors">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={handleDownload} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#2ecc71] transition-colors">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => window.print()} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#2ecc71] transition-colors">
              <Printer className="h-4 w-4" />
            </button>
            <button className="ml-1 rounded-full bg-[#2ecc71] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#27af61] transition-colors">
              Publish
            </button>
          </div>
        </div>

        {/* Breadcrumb + view toggle */}
        <div className="flex items-center justify-between border-b border-black/8 px-8 py-2.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-black/70">
            <HomeIcon className="h-3.5 w-3.5 text-black/30" />
            <ChevronRight className="h-3 w-3 text-black/25" />
            <span>{RAIL_ITEMS[railIndex].label}</span>
            <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10.5px] font-bold text-black/40">
              {isNotesTab ? NOTE_CATEGORIES.length : files.length}
            </span>
          </div>
          {!isNotesTab && (
            <div className="flex items-center gap-1 rounded-full bg-black/5 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-black/70' : 'text-black/30'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-black/70' : 'text-black/30'}`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {isNotesTab ? (
          /* ── Notes tab: taggable categories as large icon tiles ── */
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <p className="mb-5 text-[12px] text-black/40">
              Tag a note with a category below to organize it under that topic.
            </p>
            <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
              {NOTE_CATEGORIES.map(({ tag, label, icon: Icon, color }) => {
                const isActive = activeNoteTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveNoteTag((prev) => (prev === tag ? null : tag))}
                    className={`flex flex-col items-center gap-3 rounded-[14px] border px-5 py-7 transition-all ${
                      isActive
                        ? 'border-transparent shadow-lg ring-2 ring-offset-2'
                        : 'border-black/8 hover:border-black/15 hover:shadow-sm'
                    }`}
                    style={isActive ? { backgroundColor: `${color}12`, boxShadow: `0 0 0 2px ${color}` } : undefined}
                  >
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-full transition-transform"
                      style={{ backgroundColor: `${color}1f`, color, transform: isActive ? 'scale(1.08)' : undefined }}
                    >
                      <Icon className="h-8 w-8" />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-semibold text-black/80">{label}</p>
                      <p className="mt-0.5 flex items-center justify-center gap-0.5 text-[11.5px] font-medium text-black/35">
                        <Hash className="h-3 w-3" />{tag}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* File grid / list — thin scrollbar + small up/down nav arrows instead of a bulky native scrollbar */
          <div className="relative flex-1 overflow-hidden pl-8 pr-3 py-5">
            <div ref={gridRef} className="scrollbar-thin h-full overflow-y-auto pr-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={railIndex + viewMode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={viewMode === 'grid' ? 'grid grid-cols-3 gap-4 xl:grid-cols-4' : 'flex flex-col gap-2'}
                >
                  {viewMode === 'grid'
                    ? files.map((file) => (
                        <FileCard
                          key={file.id}
                          file={file}
                          active={file.id === activeId}
                          starred={starred.has(file.id)}
                          onToggleStar={() => toggleStar(file.id)}
                          onClick={() => setActiveId(file.id)}
                        />
                      ))
                    : files.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => setActiveId(file.id)}
                          className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                            file.id === activeId ? 'bg-[#eefdf3] ring-1 ring-[#2ecc71]/40' : 'hover:bg-black/3'
                          }`}
                        >
                          <div className="scale-75 origin-left"><FileIcon file={file} /></div>
                          <span className="flex-1 truncate text-[13px] font-medium text-black/75">{file.title}</span>
                          <span className="text-[11px] text-black/35">{file.sizeLabel}</span>
                          <Star
                            onClick={(e) => { e.stopPropagation(); toggleStar(file.id); }}
                            className={`h-3.5 w-3.5 ${starred.has(file.id) ? 'text-[#e8b93f]' : 'text-black/15'}`}
                            fill={starred.has(file.id) ? '#e8b93f' : 'none'}
                          />
                        </button>
                      ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Graceful scroll controls, replacing the native scrollbar's visual weight */}
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
              <button
                onClick={() => scrollGrid(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-black/40 transition-colors hover:bg-[#2ecc71]/15 hover:text-[#2ecc71]"
                aria-label="Scroll up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => scrollGrid(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-black/40 transition-colors hover:bg-[#2ecc71]/15 hover:text-[#2ecc71]"
                aria-label="Scroll down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ RIGHT: File Preview panel — only rendered once a file is selected ══ */}
      <aside className="sticky top-16 flex h-[calc(100vh-4rem)] w-[320px] shrink-0 flex-col border-l border-black/8 bg-[#faf9f4]">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[12px] font-bold uppercase tracking-widest text-black/40">File Preview</span>
          {active && (
            <button onClick={() => setActiveId(null)} aria-label="Close preview">
              <X className="h-4 w-4 text-black/25 hover:text-black/50 transition-colors" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!active ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/5 text-black/25">
                <MousePointerClick className="h-5 w-5" />
              </div>
              <p className="text-[13px] font-semibold text-black/45">No file selected</p>
              <p className="text-[12px] leading-relaxed text-black/30">Select a file from the list to preview its details here.</p>
            </motion.div>
          ) : (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col overflow-y-auto pl-3 pr-6 pb-5"
            >
              {active.kind === 'generated' && active.pdfDataUrl ? (
                <div className="mb-5 h-[220px] w-full overflow-hidden rounded-[12px] bg-white shadow-sm">
                  <iframe src={active.pdfDataUrl} title={active.title} className="h-full w-full border-0" />
                </div>
              ) : (
                <div className="mb-5 ml-3 flex items-center justify-center rounded-[12px] bg-white p-6 shadow-sm">
                  {active.kind === 'page' && active.pageNum ? (
                    <img src={pageImg(active.pageNum)} alt={active.title} className="h-[180px] w-auto rounded-[4px] object-cover shadow" />
                  ) : (
                    <div className="flex h-[120px] w-[92px] items-center justify-center rounded-[6px]" style={{ backgroundColor: KIND_COLORS.draft }}>
                      <PenSquare className="h-8 w-8 text-white" />
                    </div>
                  )}
                </div>
              )}

              <h2 className="text-[15px] font-bold text-black">{active.title}</h2>
              <p className="mt-1 text-[11px] text-black/35">{active.sizeLabel} · Modified 3 days ago</p>

              <div className="mt-5">
                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-widest text-black/35">File Description</p>
                <p className="text-[12.5px] leading-relaxed text-black/60">{active.description}</p>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-[10.5px] font-bold uppercase tracking-widest text-black/35">File Shared With</p>
                <div className="flex flex-col gap-2.5">
                  {['George Williamson', 'Nicholas Peterson', 'Ravenmark (You)'].map((name) => (
                    <div key={name} className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2ecc71] text-[10px] font-bold text-white">
                        {name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </span>
                      <span className="text-[12px] text-black/65">{name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2 pt-6">
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[#2ecc71] py-2.5 text-[11.5px] font-bold text-white hover:bg-[#27af61] transition-colors">
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 text-black/45 hover:text-black transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/10 text-black/45 hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

export default ProposalDoc;
