import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid2x2, FileText, PenSquare, CheckCircle2, MessageSquareText, Star,
  MoreVertical, Search, LayoutGrid, List, Share2,
  ChevronRight, Home as HomeIcon, Download, Printer, X, ChevronUp, ChevronDown,
  FileIcon as FileGeneratedIcon,
  Wallet, Anchor, UtensilsCrossed, CalendarCheck, Users, Sparkles, Hash,
  Maximize2, Mail, HardDrive, Box, MessageCircle, Trash2,
} from 'lucide-react';
import { loadProposals, subscribeProposals, deleteProposal, type GeneratedProposal } from '@/lib/proposalStore';

/* ─── Real document pages from the uploaded PDF ─── */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const pageImg = (n: number) => `${BASE}/doc-pages/page_${String(n).padStart(2, '0')}.png`;

type FileKind = 'multipage' | 'generated';

type ProposalFile = {
  id: string;
  title: string;
  kind: FileKind;
  pageNums?: number[];
  sizeLabel: string;
  description: string;
  pdfDataUrl?: string;
  // Carried through from the lead this quote was built for, when known —
  // lets Share address Gmail to this exact person instead of a blank compose.
  leadName?: string;
  leadEmail?: string;
};

/** Maps a webhook-generated proposal (from the Forms wizard) into a file card — one card per lead's PDF. */
function proposalToFile(p: GeneratedProposal): ProposalFile {
  return {
    id: p.id,
    title: p.title,
    kind: 'generated',
    sizeLabel: 'PDF',
    description: `Generated for ${p.guestCount || '—'} guests aboard ${p.vesselType || 'a vessel TBC'}. Grand total £${p.grandTotal.toFixed(2)}.`,
    pdfDataUrl: p.pdfDataUrl,
    leadName: p.leadName,
    leadEmail: p.leadEmail,
  };
}

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
  multipage: '#2ecc71',
  generated: '#e8b93f',
};

function FileIcon({ file }: { file: ProposalFile }) {
  if (file.kind === 'multipage' && file.pageNums?.length) {
    return (
      <div className="h-14 w-11 overflow-hidden rounded-[4px] bg-white shadow-sm ring-1 ring-black/10">
        <img src={pageImg(file.pageNums[0])} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
      </div>
    );
  }
  return (
    <div
      className="flex h-14 w-11 items-center justify-center rounded-[4px] text-white"
      style={{ backgroundColor: KIND_COLORS[file.kind] }}
    >
      <FileGeneratedIcon className="h-5 w-5" />
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
        active ? 'bg-[#FFF1F0] ring-2 ring-[#FF5A45]' : 'bg-[#faf9f4] hover:bg-[#f3f2ea]'
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
  const [, navigate] = useLocation();
  const [railIndex, setRailIndex] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeNoteTag, setActiveNoteTag] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedProposal[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadProposals().then((rows) => {
        if (!cancelled) setGenerated(rows);
      });
    };
    refresh();
    const unsubscribe = subscribeProposals(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
  const allFilesWithGenerated: ProposalFile[] = generatedFiles;

  // One card per PDF document (one proposal per lead) — never one card per page.
  const active = allFilesWithGenerated.find((f) => f.id === activeId) ?? null;

  // Chrome's PDF viewer won't reliably render a data: URL inside an <iframe src>
  // (it renders blank), but it renders a blob: object URL correctly. Convert once
  // per opened document and revoke it when the modal closes / a different doc opens.
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!active || active.kind !== 'generated' || !active.pdfDataUrl) {
      setPdfBlobUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    try {
      const [, base64] = active.pdfDataUrl.split(',');
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      objectUrl = URL.createObjectURL(blob);
      setPdfBlobUrl(objectUrl);
    } catch {
      setPdfBlobUrl(null);
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [active?.id]);

  const isNotesTab = railIndex === 4;

  const files = allFilesWithGenerated; // All / Pricing / Drafts / Signed currently reuse the same document set

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
    if (active.kind !== 'multipage' || !active.pageNums?.length) return;
    const a = document.createElement('a');
    a.href = pageImg(active.pageNums[0]);
    a.download = `proposal-${active.title.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const scrollGrid = (dir: 1 | -1) => {
    gridRef.current?.scrollBy({ top: dir * 260, behavior: 'smooth' });
  };

  const handleEdit = () => {
    if (!active) return;
    navigate('/quote-builder');
  };

  const handleDelete = async () => {
    if (!active || active.kind !== 'generated') return;
    const ok = window.confirm(`Delete "${active.title}"? This can't be undone.`);
    if (!ok) return;
    const deleted = await deleteProposal(active.id);
    if (deleted) setActiveId(null);
  };

  /* ── Share targets: each opens the exact right destination in a new tab ── */
  const handleShareFullScreen = () => {
    if (!active) return;
    setShareOpen(false);
    if (pdfBlobUrl) {
      // pagemode=none collapses the thumbnail sidebar; zoom=200 opens at 200%.
      window.open(`${pdfBlobUrl}#zoom=200&pagemode=none`, '_blank', 'noopener,noreferrer');
    } else if (active.kind === 'multipage' && active.pageNums?.length) {
      window.open(pageImg(active.pageNums[0]), '_blank', 'noopener,noreferrer');
    }
  };

  const handleShareGmail = () => {
    if (!active) return;
    setShareOpen(false);
    const subject = encodeURIComponent(`Proposal: ${active.title}`);
    const greetingName = active.leadName ? active.leadName.split(' ')[0] : 'there';
    const body = encodeURIComponent(
      `Hi ${greetingName},\n\nPlease find attached the proposal "${active.title}".\n\n${active.description}\n\nBest regards`,
    );
    // to= addresses the compose window straight to this lead's exact inbox when known.
    const to = active.leadEmail ? `&to=${encodeURIComponent(active.leadEmail)}` : '';
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1${to}&su=${subject}&body=${body}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleShareDrive = () => {
    setShareOpen(false);
    window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener,noreferrer');
  };

  const handleShareDropbox = () => {
    setShareOpen(false);
    window.open('https://www.dropbox.com/home', '_blank', 'noopener,noreferrer');
  };

  const handleShareWhatsapp = () => {
    if (!active) return;
    setShareOpen(false);
    const text = encodeURIComponent(`Proposal: ${active.title} — ${active.description}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const SHARE_TARGETS = [
    { label: 'Full Screen', icon: Maximize2, color: '#1a1a1a', onClick: handleShareFullScreen },
    { label: 'Gmail', icon: Mail, color: '#EA4335', onClick: handleShareGmail },
    { label: 'Google Drive', icon: HardDrive, color: '#34A853', onClick: handleShareDrive },
    { label: 'Dropbox', icon: Box, color: '#0061FF', onClick: handleShareDropbox },
    { label: 'WhatsApp', icon: MessageCircle, color: '#25D366', onClick: handleShareWhatsapp },
  ];

  return (
    <div className="flex bg-white" style={{ minHeight: 'calc(100vh - 4rem)' }}>

      {/* ══ LEFT ICON RAIL ══ */}
      <aside className="sticky top-16 flex h-[calc(100vh-4rem)] w-[68px] shrink-0 flex-col items-center gap-2 border-r border-black/8 bg-[#E22A12] py-6">
        <span className="mb-6 flex h-9 w-9 items-center justify-center rounded-[8px] bg-white text-[13px] font-bold text-[#E22A12]">
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
            <h1 className="text-[22px] font-bold text-black">Proposals</h1>
            <p className="mt-0.5 text-[11.5px] text-black/35">
              {generatedFiles.length
                ? `${generatedFiles.length} generated proposal${generatedFiles.length === 1 ? '' : 's'}`
                : 'Generated proposals appear here after Quote Builder'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-black transition-colors">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={handleDownload} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#FF5A45] transition-colors">
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => window.print()} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#FF5A45] transition-colors">
              <Printer className="h-4 w-4" />
            </button>
            <button className="ml-1 rounded-full bg-[#FF5A45] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#F4412A] transition-colors">
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
          /* File grid / list — thin scrollbar + small up/down nav arrows instead of a bulky native scrollbar.
             No right-hand preview panel: content stretches all the way to the right edge. */
          <div className="relative flex-1 overflow-hidden pl-8 pr-11 py-5">
            <div ref={gridRef} className="scrollbar-thin h-full overflow-y-auto pr-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={railIndex + viewMode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={viewMode === 'grid' ? 'grid grid-cols-4 gap-4 xl:grid-cols-6' : 'flex flex-col gap-2'}
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
                            file.id === activeId ? 'bg-[#FFF1F0] ring-1 ring-[#FF5A45]/40' : 'hover:bg-black/3'
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
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-black/40 transition-colors hover:bg-[#FF5A45]/15 hover:text-[#FF5A45]"
                aria-label="Scroll up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => scrollGrid(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-black/40 transition-colors hover:bg-[#FF5A45]/15 hover:text-[#FF5A45]"
                aria-label="Scroll down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ Document viewer — opens full-screen with the actual pages, scrollable, when a file is clicked.
             Replaces the old right-hand File Preview panel entirely. ══ */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="viewer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setActiveId(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[16px] bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-black/8 px-6 py-4">
                <div>
                  <h2 className="text-[15px] font-bold text-black">{active.title}</h2>
                  <p className="mt-0.5 text-[11px] text-black/35">{active.sizeLabel} · Modified 3 days ago</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleDownload} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#FF5A45] transition-colors" aria-label="Download">
                    <Download className="h-4 w-4" />
                  </button>
                  <button onClick={() => setActiveId(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-black transition-colors" aria-label="Close preview">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable body — the actual document pages, not just a thumbnail */}
              <div className="flex-1 overflow-y-auto bg-black/5 px-6 py-6">
                {active.kind === 'generated' && active.pdfDataUrl ? (
                  pdfBlobUrl ? (
                    <iframe
                      src={pdfBlobUrl}
                      title={active.title}
                      className="h-[1400px] w-full rounded-[8px] border-0 bg-white shadow"
                    />
                  ) : (
                    <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2 rounded-[8px] bg-white text-center text-[12.5px] text-black/50 shadow">
                      <p>Preview unavailable — download the PDF to view it.</p>
                    </div>
                  )
                ) : active.kind === 'multipage' && active.pageNums?.length ? (
                  <div className="mx-auto flex max-w-[720px] flex-col gap-4">
                    {active.pageNums.map((n) => (
                      <img
                        key={n}
                        src={pageImg(n)}
                        alt={`${active.title} — page ${n}`}
                        className="w-full rounded-[6px] bg-white object-contain shadow"
                        loading="lazy"
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 border-t border-black/8 px-6 py-4">
                <p className="flex-1 text-[12.5px] leading-relaxed text-black/60">{active.description}</p>
                <button
                  onClick={() => setShareOpen(true)}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-blue-600 px-4 py-2.5 text-[11.5px] font-bold text-white hover:bg-blue-700 transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
                <button
                  onClick={handleEdit}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-black px-4 py-2.5 text-[11.5px] font-bold text-white hover:bg-black/80 transition-colors"
                >
                  <PenSquare className="h-3.5 w-3.5" /> Edit
                </button>
                {active.kind === 'generated' && (
                  <button
                    onClick={handleDelete}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-black px-4 py-2.5 text-[11.5px] font-bold text-white hover:bg-black/80 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Share overlay — beautiful icon tiles for each destination; each opens the exact right place ══ */}
      <AnimatePresence>
        {shareOpen && active && (
          <motion.div
            key="share-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setShareOpen(false)}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[480px] rounded-[20px] bg-white p-7 shadow-2xl"
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-black/85">Share proposal</h3>
                <button
                  onClick={() => setShareOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-black transition-colors"
                  aria-label="Close share menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-6 truncate text-[12.5px] text-black/40">
                {active.title}
                {active.leadEmail && <> · to <span className="font-semibold text-black/60">{active.leadEmail}</span></>}
              </p>

              <div className="grid grid-cols-5 gap-3">
                {SHARE_TARGETS.map(({ label, icon: Icon, color, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="flex flex-col items-center gap-2 rounded-[14px] p-2 transition-colors hover:bg-black/4"
                  >
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105"
                      style={{ backgroundColor: `${color}18`, color }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-center text-[10px] font-semibold leading-tight text-black/60">{label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProposalDoc;
