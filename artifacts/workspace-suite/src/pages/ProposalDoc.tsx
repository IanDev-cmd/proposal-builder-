import { useState, useRef } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  ArrowLeft, FileText, Layers, PenSquare, CheckCircle2, MessageSquareText,
  Printer, Plus, Trash2, ChevronRight, Download, GripVertical,
  ChevronLeft, ChevronUp, ChevronDown, ZoomIn, ZoomOut,
} from 'lucide-react';

/* ─── Real document pages from the uploaded PDF ─── */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const pageImg = (n: number) => `${BASE}/doc-pages/page_${String(n).padStart(2, '0')}.png`;

type DocPage = { id: string; title: string; pageNum: number };

const DOC_PAGES: DocPage[] = [
  { id: 'p1',  title: 'Our Proposal',                         pageNum: 1  },
  { id: 'p2',  title: 'Contents',                             pageNum: 2  },
  { id: 'p3',  title: 'About Us',                             pageNum: 3  },
  { id: 'p4',  title: 'Our Mission',                          pageNum: 4  },
  { id: 'p5',  title: 'Why West End on the Thames?',          pageNum: 5  },
  { id: 'p6',  title: 'Your Assigned Team',                   pageNum: 6  },
  { id: 'p7',  title: 'Testimonials',                         pageNum: 7  },
  { id: 'p8',  title: 'Statement',                            pageNum: 8  },
  { id: 'p9',  title: 'Vessel Details',                       pageNum: 9  },
  { id: 'p10', title: 'Catering',                             pageNum: 10 },
  { id: 'p11', title: 'River Map',                            pageNum: 11 },
  { id: 'p12', title: 'Instagram',                            pageNum: 12 },
  { id: 'p13', title: 'Your Bespoke Package',                 pageNum: 13 },
  { id: 'p14', title: 'Added Extras',                         pageNum: 14 },
  { id: 'p15', title: 'Booking Procedure & Event Prep',       pageNum: 15 },
  { id: 'p16', title: 'Your Contact',                         pageNum: 16 },
  { id: 'p17', title: 'Google Reviews',                       pageNum: 17 },
  { id: 'p18', title: 'Land Venue Option',                    pageNum: 18 },
];

/* ─── Draft cards (real content from the doc) ─── */
type Draft = { id: string; section: string; title: string; body: string; highlight?: string };

const INITIAL_DRAFTS: Draft[] = [
  {
    id: 'd1', section: 'Section 1', title: 'Cover Letter',
    body: 'Thank you for your enquiry into chartering a West End on the Thames vessel for your upcoming event. Please let me know if you would like any details amended.',
    highlight: 'West End on the Thames',
  },
  {
    id: 'd2', section: 'Section 2', title: 'Bespoke Package',
    body: 'Your bespoke package includes full venue hire, professional photographers, personalised playlist, summer garden games, décor, food & beverages, and full event management.',
    highlight: '£4,000 — 50 guests',
  },
  {
    id: 'd3', section: 'Section 3', title: 'Booking Procedure',
    body: 'Initial proposal sent within 24hrs. Follow-up call within 48hrs. Booking form issued after confirmation. 20% deposit secures the date. Balance due 21 days prior.',
    highlight: undefined,
  },
];

const TOP_TABS = [
  { icon: FileText,         label: 'Details'  },
  { icon: Layers,           label: 'Pricing'  },
  { icon: PenSquare,        label: 'Drafts'   },
  { icon: CheckCircle2,     label: 'Signed'   },
  { icon: MessageSquareText,label: 'Notes'    },
];

/* ──────────────────────── Thumbnail ──────────────────────── */
function PageThumb({
  page, index, active, onClick,
}: {
  page: DocPage; index: number; active: boolean; onClick: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={page} dragListener={false} dragControls={controls}>
      <motion.div
        whileHover={{ scale: 1.015 }}
        onClick={onClick}
        className={`relative flex cursor-pointer overflow-hidden bg-white transition-all ${
          active ? 'ring-2 ring-[#2ecc71]' : 'ring-1 ring-black/8 hover:ring-black/20'
        }`}
      >
        {/* Drag handle */}
        <button
          onPointerDown={(e) => controls.start(e)}
          className="flex w-5 shrink-0 cursor-grab items-center justify-center bg-black/3 active:cursor-grabbing hover:bg-black/8 transition-colors"
        >
          <GripVertical className="h-2.5 w-2.5 text-black/25" />
        </button>

        {/* Page preview */}
        <div className="flex flex-1 flex-col">
          {/* Actual page image thumbnail */}
          <div className="relative overflow-hidden bg-[#f8f6f0]" style={{ aspectRatio: '510/297' }}>
            <img
              src={pageImg(page.pageNum)}
              alt={page.title}
              className="h-full w-full object-cover object-top"
              loading="lazy"
            />
            {active && (
              <div className="absolute inset-0 ring-2 ring-inset ring-[#2ecc71]/40" />
            )}
          </div>
          {/* Label row */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className={`text-[8.5px] font-bold tabular-nums ${active ? 'text-[#2ecc71]' : 'text-black/30'}`}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="text-right text-[8px] text-black/40 leading-tight truncate max-w-[90px]">
              {page.title}
            </span>
          </div>
          {active && <div className="h-[2px] bg-[#2ecc71]" />}
        </div>
      </motion.div>
    </Reorder.Item>
  );
}

/* ──────────────────────── Draft Card ──────────────────────── */
function DraftCard({
  draft, onDragToTrash, trashRef,
}: {
  draft: Draft;
  onDragToTrash: (id: string) => void;
  trashRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [isDragging, setIsDragging] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, y: -20 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      drag
      dragMomentum={false}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(_, info) => {
        setIsDragging(false);
        if (!trashRef.current) return;
        const rect = trashRef.current.getBoundingClientRect();
        const { x, y } = info.point;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          onDragToTrash(draft.id);
        }
      }}
      whileHover={{ y: -3, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
      className={`w-[200px] shrink-0 cursor-grab bg-white p-4 active:cursor-grabbing select-none ${
        isDragging ? 'ring-2 ring-[#2ecc71] shadow-2xl z-50 rotate-1' : 'ring-1 ring-black/10 shadow-sm'
      }`}
    >
      <p className="mb-0.5 text-[9.5px] font-bold uppercase tracking-widest text-black/30">{draft.section}</p>
      <p className="mb-3 text-[13px] font-bold text-black leading-tight">{draft.title}</p>
      <p className="text-[11px] leading-relaxed text-black/50 line-clamp-4">{draft.body}</p>
      {draft.highlight && (
        <p className="mt-3 text-[10.5px] leading-relaxed">
          <span className="bg-[#c7f9dd] px-0.5 text-black/70">{draft.highlight}</span>
        </p>
      )}
    </motion.div>
  );
}

/* ──────────────────────── Main export ──────────────────────── */
export function ProposalDoc() {
  const [activeTab, setActiveTab]       = useState(0);
  const [pages, setPages]               = useState<DocPage[]>(DOC_PAGES);
  const [activePage, setActivePage]     = useState(0);
  const [zoom, setZoom]                 = useState(1);
  const [drafts, setDrafts]             = useState<Draft[]>(INITIAL_DRAFTS);
  const [trashed, setTrashed]           = useState<Draft | null>(null);
  const [dragOver, setDragOver]         = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);

  const currentPage = pages[activePage] ?? pages[0];

  const goTo = (i: number) => setActivePage(Math.max(0, Math.min(pages.length - 1, i)));

  const handleDragToTrash = (id: string) => {
    const found = drafts.find((d) => d.id === id);
    if (!found) return;
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setTrashed(found);
  };

  const undoTrash = () => {
    if (!trashed) return;
    setDrafts((prev) => [...prev, trashed]);
    setTrashed(null);
  };

  const addDraft = () => {
    const n = drafts.length + 1;
    setDrafts((prev) => [
      ...prev,
      { id: `d${Date.now()}`, section: `Section ${n}`, title: 'Untitled Draft', body: 'Start writing this section...', highlight: undefined },
    ]);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/doc-pages/page_${String(currentPage.pageNum).padStart(2, '0')}.png`;
    a.download = `proposal-page-${currentPage.pageNum}.png`;
    a.click();
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const imgs = pages.map((p) => `<img src="${pageImg(p.pageNum)}" style="width:100%;page-break-after:always;" />`).join('');
    w.document.write(`<html><body style="margin:0">${imgs}</body></html>`);
    w.document.close();
    w.print();
  };

  const br = 'border-black/8';

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full flex-col bg-[#eaeaef]">

      {/* ══ TOP BAR ══ */}
      <div className="flex items-center bg-white border-b border-black/8">
        {/* Back */}
        <button className={`flex h-12 w-12 shrink-0 items-center justify-center border-r ${br} text-black/35 hover:text-black transition-colors`}>
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <div className={`flex items-center gap-1 border-r ${br} px-4 h-12 shrink-0`}>
          <span className="text-[12px] font-bold text-black whitespace-nowrap">Catering Services Proposal</span>
          {['Proposals', 'Hospitality Sector', 'WE.9055'].map((part) => (
            <span key={part} className="flex items-center gap-1 text-[11px] text-black/35 whitespace-nowrap">
              <ChevronRight className="h-3 w-3 shrink-0" />{part}
            </span>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-1 items-stretch justify-center">
          {TOP_TABS.map((tab, i) => {
            const Icon = tab.icon;
            const active = activeTab === i;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`flex h-12 flex-col items-center justify-center gap-0.5 px-6 border-r ${br} transition-colors ${
                  active ? 'bg-[#2ecc71]' : 'hover:bg-black/3'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : 'text-black/35'}`} />
                <span className={`text-[9.5px] font-semibold whitespace-nowrap ${active ? 'text-white' : 'text-black/35'}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div className={`flex items-center border-l ${br}`}>
          {/* Zoom controls — only in Details view */}
          {activeTab === 0 && (
            <>
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className={`flex h-12 w-10 items-center justify-center border-r ${br} text-black/35 hover:text-black transition-colors`}><ZoomOut className="h-4 w-4" /></button>
              <span className={`flex h-12 w-12 items-center justify-center border-r ${br} text-[10px] font-bold text-black/40`}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className={`flex h-12 w-10 items-center justify-center border-r ${br} text-black/35 hover:text-black transition-colors`}><ZoomIn className="h-4 w-4" /></button>
            </>
          )}
          <button onClick={handleDownload} className={`flex h-12 w-10 items-center justify-center border-r ${br} text-black/35 hover:text-[#2ecc71] transition-colors`}><Download className="h-4 w-4" /></button>
          <button onClick={handlePrint} className={`flex h-12 w-10 items-center justify-center border-r ${br} text-black/35 hover:text-[#2ecc71] transition-colors`}><Printer className="h-4 w-4" /></button>
          <button className="flex h-12 items-center gap-1.5 bg-[#2ecc71] px-5 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-[#27af61] transition-colors">
            Publish
          </button>
        </div>
      </div>

      {/* ══ BODY ══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Details: real PDF viewer + thumbnail strip ── */}
        {activeTab === 0 && (
          <>
            {/* Main viewer */}
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {/* Page nav row */}
              <div className={`flex items-center justify-between border-b ${br} bg-white px-5 py-2`}>
                <div className="flex items-center gap-1 text-[11px] text-black/40">
                  <Volume2Icon />
                  <span className="ml-1 font-semibold text-black/70">{currentPage.title}</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>Page {activePage + 1} of {pages.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => goTo(activePage - 1)} disabled={activePage === 0} className="flex h-7 w-7 items-center justify-center text-black/30 hover:text-black disabled:opacity-20 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className={`flex h-7 items-center px-3 text-[10px] font-bold border ${br} text-black/50`}>{activePage + 1} / {pages.length}</span>
                  <button onClick={() => goTo(activePage + 1)} disabled={activePage === pages.length - 1} className="flex h-7 w-7 items-center justify-center text-black/30 hover:text-black disabled:opacity-20 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Page image */}
              <div className="flex-1 overflow-auto bg-[#eaeaef] flex items-start justify-center p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPage.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                    className="shadow-2xl bg-white"
                    style={{ width: `${zoom * 100}%`, maxWidth: `${zoom * 960}px` }}
                  >
                    <img
                      src={pageImg(currentPage.pageNum)}
                      alt={currentPage.title}
                      className="block w-full h-auto"
                      draggable={false}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Bottom status */}
              <div className={`flex items-center justify-between border-t ${br} bg-white px-5 py-2`}>
                <div className="flex items-center gap-4 text-[10.5px] text-black/35">
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 bg-[#2ecc71]" />In Review</span>
                  <span>WE.9055 — Blue Apple Contract Catering</span>
                  <span>Valid 28 days</span>
                </div>
                <span className="text-[10.5px] text-black/35">
                  {pages.length} pages · PDF
                </span>
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className={`flex w-[185px] shrink-0 flex-col border-l ${br} bg-[#f6f6f8]`}>
              <div className={`flex items-center justify-between border-b ${br} px-3 py-2.5`}>
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/35">
                  Pages — {pages.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => goTo(activePage - 1)} disabled={activePage === 0} className="flex h-5 w-5 items-center justify-center text-black/30 hover:text-black disabled:opacity-20 transition-colors">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => goTo(activePage + 1)} disabled={activePage === pages.length - 1} className="flex h-5 w-5 items-center justify-center text-black/30 hover:text-black disabled:opacity-20 transition-colors">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-2">
                <Reorder.Group
                  axis="y"
                  values={pages}
                  onReorder={(newOrder) => {
                    const activeId = pages[activePage]?.id;
                    setPages(newOrder);
                    const newIdx = newOrder.findIndex((p) => p.id === activeId);
                    if (newIdx >= 0) setActivePage(newIdx);
                  }}
                  className="flex flex-col gap-2 px-2"
                >
                  {pages.map((page, i) => (
                    <PageThumb
                      key={page.id}
                      page={page}
                      index={i}
                      active={i === activePage}
                      onClick={() => setActivePage(i)}
                    />
                  ))}
                </Reorder.Group>
              </div>
            </div>
          </>
        )}

        {/* ── Drafts: GIF-style horizontal cards ── */}
        {activeTab === 2 && (
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {/* Create draft */}
            <div className={`flex items-center justify-center border-b ${br} bg-white py-5`}>
              <button
                onClick={addDraft}
                className="flex items-center gap-2 text-black/35 hover:text-[#2ecc71] transition-colors group"
              >
                <div className={`flex h-8 w-8 items-center justify-center border ${br} group-hover:border-[#2ecc71] transition-colors`}>
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-[11px] font-semibold">Create draft</span>
              </button>
            </div>

            {/* Cards */}
            <div className="flex flex-1 items-start justify-start gap-4 overflow-x-auto bg-[#eaeaef] px-6 pt-6 pb-2">
              <AnimatePresence mode="popLayout">
                {drafts.map((draft) => (
                  <DraftCard key={draft.id} draft={draft} onDragToTrash={handleDragToTrash} trashRef={trashRef} />
                ))}
              </AnimatePresence>
            </div>

            {/* Trash zone */}
            <div
              ref={trashRef}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={() => setDragOver(false)}
              className={`flex flex-col items-center justify-center gap-2 border-t ${br} bg-white py-5 transition-colors ${dragOver ? 'bg-red-50' : ''}`}
            >
              <div className={`flex h-9 w-9 items-center justify-center transition-colors ${dragOver ? 'bg-red-500' : 'bg-red-100'}`}>
                <Trash2 className={`h-4 w-4 ${dragOver ? 'text-white' : 'text-red-400'}`} />
              </div>
              <span className={`text-[10px] font-semibold ${dragOver ? 'text-red-500' : 'text-black/30'}`}>Drop your files to delete</span>
            </div>

            {/* Undo toast */}
            <AnimatePresence>
              {trashed && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-24 right-4 flex items-center gap-3 bg-white border border-black/8 px-4 py-2.5 shadow-lg"
                >
                  <span className="text-[11px] text-black/40">Move to trash</span>
                  <span className="text-black/20">—</span>
                  <button onClick={undoTrash} className="text-[11px] font-bold text-[#2ecc71] hover:underline">Undo</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Other tabs ── */}
        {activeTab !== 0 && activeTab !== 2 && (
          <div className="flex flex-1 items-center justify-center bg-[#eaeaef]">
            <p className="text-[13px] text-black/30">{TOP_TABS[activeTab]?.label} — coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* tiny helper to avoid importing another icon */
function Volume2Icon() {
  return (
    <svg className="h-3.5 w-3.5 text-black/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

export default ProposalDoc;
