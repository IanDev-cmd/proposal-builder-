import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PenSquare, Star, Search,
  Download, Printer, X, ChevronUp, ChevronDown,
  FileIcon as FileGeneratedIcon,
  Maximize2, Mail, HardDrive, Box, MessageCircle, Trash2, Link2,
} from 'lucide-react';
import { loadProposals, subscribeProposals, deleteProposal, type GeneratedProposal } from '@/lib/proposalStore';
import { downloadNamedPdf, isLegacyEventVesselProposal, proposalFilenameFromRecord } from '@/lib/proposalFilename';
import { ShareOverlay, ShareTriggerButton } from '@/components/ShareOverlay';
import { dataUrlToFile, shareArtifact, type ShareChannel } from '@/lib/quoteShare';
import { toastError, toastSuccess } from '@/lib/notify';
import { saveQuoteDraft } from '@/lib/quoteDraftStore';
import { setQuoteLead } from '@/lib/quoteLeadStore';
import { listSavedQuotes } from '@/lib/savedQuotesStore';
import { formatGbpPounds } from '@/lib/utils';

/* ─── Real document pages from the uploaded PDF ─── */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const pageImg = (n: number) => `${BASE}/doc-pages/page_${String(n).padStart(2, '0')}.png`;

type FileKind = 'multipage' | 'generated';

type ProposalFile = {
  id: string;
  title: string;
  filename?: string;
  kind: FileKind;
  pageNums?: number[];
  sizeLabel: string;
  description: string;
  pdfDataUrl?: string;
  // Carried through from the lead this quote was built for, when known —
  // lets Share address Gmail to this exact person instead of a blank compose.
  leadName?: string;
  leadEmail?: string;
  leadCompany?: string;
  referenceNumber?: string;
};

function proposalPdfFilename(file: Pick<ProposalFile, 'title' | 'filename' | 'leadName' | 'leadCompany' | 'referenceNumber'>): string {
  return proposalFilenameFromRecord(file);
}

/** Maps a webhook-generated proposal (from the Forms wizard) into a file card — one card per lead's PDF. */
function proposalToFile(p: GeneratedProposal): ProposalFile {
  const linked = listSavedQuotes().find((q) => q.proposalId === p.id);
  const filename = proposalFilenameFromRecord({
    filename: p.filename,
    title: p.title,
    leadName: p.leadName || linked?.leadName || linked?.lead?.name,
    leadCompany: p.leadCompany || linked?.lead?.company,
    referenceNumber: p.referenceNumber || linked?.referenceNumber || linked?.lead?.referenceNumber,
  });
  return {
    id: p.id,
    title: p.title,
    filename,
    kind: 'generated',
    sizeLabel: 'PDF',
    description: `Generated for ${p.guestCount || '—'} guests aboard ${p.vesselType || 'a vessel TBC'}. Grand total ${formatGbpPounds(p.grandTotal)}.`,
    pdfDataUrl: p.pdfDataUrl,
    leadName: p.leadName,
    leadEmail: p.leadEmail,
    leadCompany: p.leadCompany || linked?.lead?.company,
    referenceNumber: p.referenceNumber || linked?.referenceNumber || linked?.lead?.referenceNumber,
  };
}

const KIND_COLORS: Record<FileKind, string> = {
  multipage: '#2ecc71',
  generated: '#2F7CF6',
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

function proposalShareUrl(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/proposal-doc?id=${encodeURIComponent(id)}`;
}

/* ──────────────────────── Main export ──────────────────────── */
export function ProposalDoc() {
  const [, navigate] = useLocation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<GeneratedProposal[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [query, setQuery] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadProposals()
        .then((rows) => {
          if (!cancelled) setGenerated(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            setGenerated([]);
            toastError({
              key: 'proposals-load',
              title: 'Could not load proposals',
              err,
            });
          }
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
    } else {
      generated.forEach((p) => generatedIds.current.add(p.id));
    }
  }, [generated]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setActiveId(id);
  }, [generated]);

  const generatedFiles = generated.filter((p) => !isLegacyEventVesselProposal(p)).map(proposalToFile);
  const q = query.trim().toLowerCase();
  const files = useMemo(() => {
    const visible = generated.filter((p) => !isLegacyEventVesselProposal(p));
    if (!q) return visible.map(proposalToFile);
    return visible
      .filter((p) =>
        [p.title, p.filename, p.leadName, p.leadEmail, p.leadCompany, p.referenceNumber, p.vesselType, p.eventType, p.guestCount, p.eventDate]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .map(proposalToFile);
  }, [generated, q]);
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
    const holder: { url: string | null } = { url: null };
    let cancelled = false;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(active.pdfDataUrl!, { signal: ctrl.signal });
        const blob = await res.blob();
        if (cancelled) return;
        const named = new File([blob], proposalPdfFilename(active), { type: 'application/pdf' });
        holder.url = URL.createObjectURL(named);
        setPdfBlobUrl(holder.url);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setPdfBlobUrl(null);
        toastError({
          key: 'pdf-preview',
          title: 'Could not preview PDF',
          description: 'The stored file may be corrupt. Try downloading instead.',
        });
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
      if (holder.url) URL.revokeObjectURL(holder.url);
    };
  }, [active?.id, active?.pdfDataUrl]);

  const toggleStar = (id: string) =>
    setStarred((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleDownload = () => {
    if (!active) return;
    if (active.kind === 'generated' && (pdfBlobUrl || active.pdfDataUrl)) {
      downloadNamedPdf(pdfBlobUrl || active.pdfDataUrl!, proposalPdfFilename(active));
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

  const handleEdit = async () => {
    if (!active) return;
    const linked = listSavedQuotes().find((q) => q.proposalId === active.id);
    if (linked) {
      if (linked.lead) setQuoteLead(linked.lead);
      await saveQuoteDraft({
        leadKey: linked.leadKey,
        step: Number(linked.step) >= 1 && Number(linked.step) <= 7 ? Number(linked.step) : 1,
        data: linked.data || {},
        leadName: linked.leadName,
        referenceNumber: linked.referenceNumber,
      });
    }
    navigate('/quote-builder');
  };

  const handleDelete = async () => {
    if (!active || active.kind !== 'generated') return;
    const ok = window.confirm(`Delete "${active.title}"? This can't be undone.`);
    if (!ok) return;
    const deleted = await deleteProposal(active.id);
    if (deleted) {
      setActiveId(null);
    } else {
      toastError({
        key: 'proposal-delete',
        title: 'Could not delete proposal',
        description: 'Try again or clear browser storage if the problem persists.',
      });
    }
  };

  /* ── Share targets: web Gmail / Drive / Dropbox / WhatsApp Web only ── */
  const handleShareFullScreen = () => {
    if (!active) return;
    setShareOpen(false);
    if (pdfBlobUrl) {
      // pagemode=none collapses the thumbnail sidebar; zoom=200 opens at 200%.
      window.open(`${pdfBlobUrl}#zoom=200&pagemode=none&toolbar=0`, '_blank', 'noopener,noreferrer');
    } else if (active.kind === 'multipage' && active.pageNums?.length) {
      window.open(pageImg(active.pageNums[0]), '_blank', 'noopener,noreferrer');
    }
  };

  const handleShareWithFile = async (channel: ShareChannel) => {
    if (!active) return;
    setShareOpen(false);
    let file: File | null = null;
    if (active.kind === 'generated' && active.pdfDataUrl) {
      const name = proposalPdfFilename(active);
      file = dataUrlToFile(active.pdfDataUrl, name);
    }
    if (!file) {
      toastError({
        key: 'share-file',
        title: 'No PDF to attach',
        description: 'Generate a proposal first, then share it with the file attached.',
      });
      return;
    }
    try {
      await shareArtifact(channel, {
        file,
        title: `Proposal: ${active.title}`,
        text: `Hi,\n\nPlease find attached the proposal "${active.title}".\n\n${active.description}\n\nBest regards`,
        kind: 'pdf',
      });
    } catch {
      toastError({
        key: 'share-file',
        title: 'Could not attach the PDF',
        description: 'Try downloading the proposal and sharing it from your files.',
      });
    }
  };

  const handleCopyProposalLink = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(proposalShareUrl(active.id));
      toastSuccess({ key: 'copy-proposal-link', title: 'Link copied' });
      setShareOpen(false);
    } catch {
      toastError({
        key: 'copy-proposal-link',
        title: 'Could not copy link',
        description: 'Copy the address bar URL instead.',
      });
    }
  };

  const shareTargets = [
    { label: 'Full Screen', icon: Maximize2, color: '#1a1a1a', onClick: handleShareFullScreen },
    { label: 'Copy Link', icon: Link2, color: '#1a1a1a', onClick: () => void handleCopyProposalLink() },
    { label: 'Download', icon: Download, color: '#2F7CF6', onClick: () => { handleDownload(); setShareOpen(false); } },
    { label: 'Gmail', icon: Mail, color: '#EA4335', onClick: () => void handleShareWithFile('email') },
    { label: 'Google Drive', icon: HardDrive, color: '#34A853', onClick: () => void handleShareWithFile('drive') },
    { label: 'Dropbox', icon: Box, color: '#0061FF', onClick: () => void handleShareWithFile('dropbox') },
    { label: 'WhatsApp', icon: MessageCircle, color: '#25D366', onClick: () => void handleShareWithFile('whatsapp') },
  ];

  return (
    <div className="flex bg-white" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <div className="flex flex-1 flex-col overflow-hidden">
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
            <label className="flex h-9 w-[min(280px,42vw)] items-center gap-2 rounded-full border border-black/12 bg-black/[0.03] px-3 focus-within:border-[#FF5A45] focus-within:bg-white">
              <Search className="h-4 w-4 shrink-0 text-black/30" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search proposals…"
                aria-label="Search proposals"
                data-testid="proposals-search"
                className="w-full bg-transparent text-[13px] text-black/75 outline-none placeholder:text-black/30"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-black/25 hover:text-black/50">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>
            <button
              onClick={handleDownload}
              className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#FF5A45] transition-colors"
              aria-label={active ? `Download ${proposalPdfFilename(active)}` : 'Download'}
              title={active ? proposalPdfFilename(active) : 'Download'}
            >
              <Download className="h-4 w-4" />
            </button>
            <button onClick={() => window.print()} className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#FF5A45] transition-colors">
              <Printer className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center border-b border-black/8 px-8 py-2.5">
          <span className="text-[12.5px] font-semibold text-black/70">All proposals</span>
          <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10.5px] font-bold text-black/40">
            {files.length}
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden pl-8 pr-11 py-5">
          <div ref={gridRef} className="scrollbar-thin h-full overflow-y-auto pr-5" data-page-scroll>
            <div className="flex flex-col gap-2">
              {files.length === 0 ? (
                <p className="py-16 text-center text-[13px] text-black/40">
                  {q ? `No proposals match “${query.trim()}”.` : 'Generated proposals appear here after Quote Builder'}
                </p>
              ) : (
                files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => setActiveId(file.id)}
                    className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                      file.id === activeId ? 'bg-[#FFF1F0] ring-1 ring-[#FF5A45]/40' : 'hover:bg-black/3'
                    }`}
                  >
                    <div className="origin-left scale-75"><FileIcon file={file} /></div>
                    <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-black/75">
                      {file.filename || file.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-black/35">{file.sizeLabel}</span>
                    <Star
                      onClick={(e) => { e.stopPropagation(); toggleStar(file.id); }}
                      className={`h-3.5 w-3.5 shrink-0 ${starred.has(file.id) ? 'text-[#e8b93f]' : 'text-black/15'}`}
                      fill={starred.has(file.id) ? '#e8b93f' : 'none'}
                    />
                  </button>
                ))
              )}
            </div>
          </div>

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
                  <p className="mt-0.5 truncate text-[11px] text-black/35" title={proposalPdfFilename(active)}>
                    {proposalPdfFilename(active)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-[#FF5A45] transition-colors"
                    aria-label={`Download ${proposalPdfFilename(active)}`}
                    title={proposalPdfFilename(active)}
                  >
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
                      src={`${pdfBlobUrl}#toolbar=0&navpanes=0`}
                      title={proposalPdfFilename(active)}
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
                <ShareTriggerButton color="blue" onClick={() => setShareOpen(true)} />
                <button
                  onClick={() => void handleEdit()}
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

      <ShareOverlay
        open={Boolean(shareOpen && active)}
        title="Share proposal"
        subtitle={
          active
            ? `${active.title}${active.leadEmail ? ` · to ${active.leadEmail}` : ''}`
            : undefined
        }
        targets={shareTargets}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

export default ProposalDoc;
