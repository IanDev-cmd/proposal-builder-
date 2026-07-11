import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  ArrowLeft, FileText, Layers, PenSquare, CheckCircle2, MessageSquareText,
  Printer, Plus, Trash2, Search, Volume2, ChevronRight, Download,
  GripVertical, Sun, Moon, Settings,
} from 'lucide-react';

/* ─── Types ─── */
type Page = { id: string; title: string; content: string };
type Draft = { id: string; section: string; title: string; body: string; highlight?: string };

/* ─── Doc pages ─── */
const INITIAL_PAGES: Page[] = [
  { id: 'p1', title: 'Cover Letter', content: `This proposal outlines the scope, pricing and service levels for Blue Apple Contract Catering's staff dining programme across its Manchester and Leeds sites, effective from the agreed start date for an initial 12-month term.\n\nNexus will provide day-to-day catering operations, menu planning, allergen management and monthly reporting.` },
  { id: 'p2', title: 'Scope & Pricing', content: `The agreed management fee is £4,250 per site per month, inclusive of staffing, equipment servicing and compliance audits. Food cost is charged at net invoice plus an 8% handling margin, reviewed quarterly.\n\nThis covers both the Manchester and Leeds sites for an initial period of 12 months from commencement date.` },
  { id: 'p3', title: 'Terms & Conditions', content: `Either party may terminate this agreement with 90 days' written notice. Blue Apple Contract Catering retains the right to request a service review after the first 3 months of operation.\n\nAll services are subject to the standard Nexus terms and conditions document, version 4.2 (March 2026).` },
  { id: 'p4', title: 'Staffing Plan', content: `Nexus will deploy a dedicated Site Manager at each location, supported by a team of qualified catering assistants. All staff hold Level 2 Food Hygiene certificates and undergo quarterly refresher training.\n\nStaffing ratios are maintained at 1:20 for standard service and 1:15 for elevated events.` },
  { id: 'p5', title: 'Menu Strategy', content: `Seasonal menus are refreshed quarterly in line with produce availability and client feedback. Allergen management follows FSA guidance with full transparency at point of service.\n\nSpecial dietary requirements are accommodated with 48 hours' notice across all menu categories.` },
  { id: 'p6', title: 'Compliance & Reporting', content: `Monthly performance reports will be submitted by the 5th of each calendar month. These include footfall data, food cost analysis, waste metrics, and customer satisfaction scores.\n\nQuarterly business reviews are scheduled for the first Monday of January, April, July, and October.` },
  { id: 'p7', title: 'Pricing Schedule', content: `Management Fee: £4,250 per site per month\nFood Cost Handling Margin: 8% on net invoice\nEquipment Servicing: Included\nCompliance Audits: Included (2 per year)\nAd-hoc Events: Quoted separately at time of request` },
  { id: 'p8', title: 'Sign-off', content: `This proposal is valid for 30 days from the date of issue. To proceed, please countersign the enclosed agreement and return to your Nexus account manager.\n\nFor any queries, contact: proposals@nexus.co.uk | +44 20 7946 0958` },
];

const INITIAL_DRAFTS: Draft[] = [
  { id: 'd1', section: 'Section 1', title: 'Cover Letter', body: 'A personal introduction addressed to the Blue Apple procurement team, referencing our site visit on 02 Jun. Outlines our mission and commitment to quality service delivery across both sites.', highlight: 'commitment to quality service delivery' },
  { id: 'd2', section: 'Section 2', title: 'Scope & Pricing', body: 'Per-site management fee, food cost margin, and quarterly review clause drafted from the pricing sheet. Includes staffing, compliance, and equipment servicing.', highlight: 'Per-site management fee' },
  { id: 'd3', section: 'Section 3', title: 'Terms & Conditions', body: '90-day termination notice, liability caps, and the 3-month service review checkpoint. Subject to standard Nexus T&C version 4.2.', highlight: undefined },
];

const TOP_TABS = [
  { icon: FileText, label: 'Details' },
  { icon: Layers, label: 'Pricing' },
  { icon: PenSquare, label: 'Drafts' },
  { icon: CheckCircle2, label: 'Signed' },
  { icon: MessageSquareText, label: 'Notes' },
];

/* ─── A4 Thumbnail (Details tab) ─── */
function PageThumb({ page, index, active, onClick }: { page: Page; index: number; active: boolean; onClick: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={page} dragListener={false} dragControls={controls}>
      <motion.div
        whileHover={{ scale: 1.01 }}
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

        {/* Thumbnail content */}
        <div className="flex flex-1 flex-col p-2.5">
          <div className="mb-2 flex items-start justify-between gap-1">
            <span className={`text-[9px] font-bold tabular-nums ${active ? 'text-[#2ecc71]' : 'text-black/30'}`}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="text-right text-[9px] text-black/35 leading-tight flex-1 ml-1">{page.title}</span>
          </div>
          {/* Content line previews */}
          <div className="flex flex-col gap-1">
            <div className="h-[2px] w-full bg-black/8" />
            <div className="h-[2px] w-[85%] bg-black/8" />
            <div className="h-[2px] w-full bg-black/8" />
            <div className="h-[2px] w-[70%] bg-black/8" />
            <div className="h-[2px] w-[90%] bg-black/8" />
          </div>
          {/* Active indicator */}
          {active && <div className="mt-2 h-[3px] w-[45%] bg-[#2ecc71]" />}
        </div>
      </motion.div>
    </Reorder.Item>
  );
}

/* ─── Draft Card (Drafts tab, GIF-style) ─── */
function DraftCard({
  draft,
  onDragToTrash,
  trashRef,
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
      style={{ position: 'relative' }}
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

/* ─── Main export ─── */
export function ProposalDoc() {
  const [dark, setDark] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0=Details, 2=Drafts
  const [pages, setPages] = useState<Page[]>(INITIAL_PAGES);
  const [activePage, setActivePage] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>(INITIAL_DRAFTS);
  const [trashed, setTrashed] = useState<Draft | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const trashRef = useRef<HTMLDivElement>(null);

  const currentPage = pages[activePage] ?? pages[0];

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

  const addPage = () => {
    const newPage: Page = { id: `p${Date.now()}`, title: `Section ${pages.length + 1}`, content: 'Start writing here...' };
    setPages((prev) => [...prev, newPage]);
    setActivePage(pages.length);
  };

  const handleContentChange = useCallback(() => {
    if (!editorRef.current) return;
    setPages((prev) => prev.map((p, i) => i === activePage ? { ...p, content: editorRef.current!.innerText } : p));
  }, [activePage]);

  const handleDownload = () => {
    const txt = pages.map((p) => `## ${p.title}\n\n${p.content}`).join('\n\n---\n\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'proposal.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── theme ── */
  const pageBg   = dark ? 'bg-[#111]' : 'bg-[#eaeaef]';
  const barBg    = dark ? 'bg-[#0d0d0d]' : 'bg-white';
  const docBg    = dark ? 'bg-[#1a1a1a]' : 'bg-white';
  const sideBg   = dark ? 'bg-[#141414]' : 'bg-[#f6f6f8]';
  const txt      = dark ? 'text-white' : 'text-gray-900';
  const muted    = dark ? 'text-white/40' : 'text-black/35';
  const br       = dark ? 'border-white/10' : 'border-black/8';

  return (
    <div className={`flex min-h-[calc(100vh-4rem)] w-full flex-col ${pageBg} transition-colors duration-300`}>

      {/* ══ TOP BAR ══ */}
      <div className={`flex items-center ${barBg} border-b ${br}`}>
        {/* Back */}
        <button className={`flex h-12 w-12 shrink-0 items-center justify-center border-r ${br} ${muted} hover:${txt} transition-colors`}>
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <div className={`flex items-center gap-1 border-r ${br} px-4 h-12 min-w-0 shrink-0`}>
          <span className={`text-[12px] font-bold ${txt} whitespace-nowrap`}>Catering Services Proposal</span>
          {['Proposals', 'Hospitality Sector', 'WE.18795'].map((part) => (
            <span key={part} className={`flex items-center gap-1 text-[11px] ${muted} whitespace-nowrap`}>
              <ChevronRight className="h-3 w-3 shrink-0" />{part}
            </span>
          ))}
        </div>

        {/* Centred tabs — GIF style: icon circle + label below */}
        <div className="flex flex-1 items-stretch justify-center">
          {TOP_TABS.map((tab, i) => {
            const Icon = tab.icon;
            const active = activeTab === i;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`flex h-12 flex-col items-center justify-center gap-0.5 px-6 border-r ${br} transition-colors ${
                  active ? 'bg-[#2ecc71]' : `${dark ? 'hover:bg-white/5' : 'hover:bg-black/3'}`
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-white' : muted}`} />
                <span className={`text-[9.5px] font-semibold whitespace-nowrap ${active ? 'text-white' : muted}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div className={`flex items-center border-l ${br}`}>
          <button onClick={() => setDark((d) => !d)} className={`flex h-12 w-10 items-center justify-center border-r ${br} ${muted} hover:text-[#2ecc71] transition-colors`}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={handleDownload} className={`flex h-12 w-10 items-center justify-center border-r ${br} ${muted} hover:text-[#2ecc71] transition-colors`}>
            <Download className="h-4 w-4" />
          </button>
          <button onClick={() => window.print()} className={`flex h-12 w-10 items-center justify-center border-r ${br} ${muted} hover:text-[#2ecc71] transition-colors`}>
            <Printer className="h-4 w-4" />
          </button>
          <button className="flex h-12 items-center gap-1.5 bg-[#2ecc71] px-5 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-[#27af61] transition-colors">
            Publish
          </button>
        </div>
      </div>

      {/* ══ BODY ══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Document editor (left, always visible) ── */}
        <div className={`flex flex-col overflow-hidden ${activeTab === 2 ? 'w-[42%] shrink-0' : 'flex-1'} ${docBg} transition-all duration-300`}>

          {/* Doc top row */}
          <div className={`flex items-start gap-2 border-b ${br} px-6 py-5`}>
            <div className="flex flex-col gap-3 shrink-0 mt-0.5">
              <button className={`flex h-6 w-6 items-center justify-center ${muted} hover:text-[#2ecc71] transition-colors`}>
                <Volume2 className="h-3.5 w-3.5" />
              </button>
              <button className={`flex h-6 w-6 items-center justify-center ${muted} hover:text-[#2ecc71] transition-colors`}>
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={currentPage?.title || ''}
                onChange={(e) => setPages((prev) => prev.map((p, i) => i === activePage ? { ...p, title: e.target.value } : p))}
                className={`bg-transparent text-[18px] font-black ${txt} outline-none border-none w-full`}
                placeholder="Section title"
              />
              <p className={`mt-1 flex items-center gap-1 text-[11px] ${muted}`}>
                <span>Page {activePage + 1} of {pages.length}</span>
                <ChevronRight className="h-2.5 w-2.5" />
                <span>{currentPage?.title}</span>
              </p>
            </div>
          </div>

          {/* Editable body */}
          <div className="flex-1 overflow-y-auto px-8 py-7">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleContentChange}
              className={`min-h-[300px] text-[14px] leading-[2] ${txt} outline-none whitespace-pre-wrap`}
            >
              {currentPage?.content}
            </div>
          </div>

          {/* Status footer */}
          <div className={`flex items-center justify-between border-t ${br} px-6 py-2.5`}>
            <div className={`flex items-center gap-4 text-[10.5px] ${muted}`}>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 bg-[#2ecc71]" />In Review</span>
              <span>£51,000 / yr</span>
              <span>Valid 30 days</span>
            </div>
            <span className={`text-[10.5px] ${muted}`}>{currentPage?.content.split(/\s+/).filter(Boolean).length || 0} words</span>
          </div>
        </div>

        {/* ══ RIGHT PANEL — Details tab: A4 thumbnail strip ══ */}
        {activeTab === 0 && (
          <div className={`flex w-[162px] shrink-0 flex-col border-l ${br} ${sideBg}`}>
            {/* Header */}
            <div className={`flex items-center justify-between border-b ${br} px-3 py-2.5`}>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${muted}`}>
                Pages — {pages.length}
              </span>
              <button onClick={addPage} className={`flex h-5 w-5 items-center justify-center ${muted} hover:text-[#2ecc71] transition-colors`}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Thumbnails */}
            <div className="flex-1 overflow-y-auto py-1.5">
              <Reorder.Group
                axis="y"
                values={pages}
                onReorder={(newOrder) => {
                  const activeId = pages[activePage]?.id;
                  setPages(newOrder);
                  const newIdx = newOrder.findIndex((p) => p.id === activeId);
                  if (newIdx >= 0) setActivePage(newIdx);
                }}
                className="flex flex-col gap-1.5 px-1.5"
              >
                {pages.map((page, i) => (
                  <PageThumb key={page.id} page={page} index={i} active={i === activePage} onClick={() => setActivePage(i)} />
                ))}
              </Reorder.Group>
            </div>
          </div>
        )}

        {/* ══ RIGHT PANEL — Drafts tab: GIF-style horizontal cards ══ */}
        {activeTab === 2 && (
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {/* Create draft button */}
            <div className={`flex items-center justify-center border-b ${br} py-5`}>
              <button
                onClick={addDraft}
                className={`flex items-center gap-2 ${muted} hover:text-[#2ecc71] transition-colors group`}
              >
                <div className={`flex h-8 w-8 items-center justify-center border ${br} group-hover:border-[#2ecc71] transition-colors`}>
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-[11px] font-semibold">Create draft</span>
              </button>
            </div>

            {/* Cards area */}
            <div className="flex flex-1 items-start justify-start gap-4 overflow-x-auto px-6 pt-6 pb-2">
              <AnimatePresence mode="popLayout">
                {drafts.map((draft) => (
                  <DraftCard key={draft.id} draft={draft} onDragToTrash={handleDragToTrash} trashRef={trashRef} />
                ))}
              </AnimatePresence>
            </div>

            {/* Trash drop zone */}
            <div
              ref={trashRef}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={() => { setDragOver(false); }}
              className={`flex flex-col items-center justify-center gap-2 py-5 border-t ${br} transition-colors ${
                dragOver ? 'bg-red-50' : ''
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center ${dragOver ? 'bg-red-500' : 'bg-red-100'} transition-colors`}>
                <Trash2 className={`h-4 w-4 ${dragOver ? 'text-white' : 'text-red-400'}`} />
              </div>
              <span className={`text-[10px] font-semibold ${dragOver ? 'text-red-500' : muted}`}>Drop your files to delete</span>
            </div>

            {/* Undo toast */}
            <AnimatePresence>
              {trashed && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className={`absolute bottom-20 right-4 flex items-center gap-3 ${barBg} border ${br} px-4 py-2.5 shadow-lg`}
                >
                  <span className={`text-[11px] ${muted}`}>Move to trash</span>
                  <span className={muted}>—</span>
                  <button onClick={undoTrash} className="text-[11px] font-bold text-[#2ecc71] hover:underline">Undo</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ══ Other tabs: placeholder ══ */}
        {activeTab !== 0 && activeTab !== 2 && (
          <div className="flex flex-1 items-center justify-center">
            <p className={`text-[13px] ${muted}`}>{TOP_TABS[activeTab]?.label} — coming soon</p>
          </div>
        )}

      </div>
    </div>
  );
}

export default ProposalDoc;
