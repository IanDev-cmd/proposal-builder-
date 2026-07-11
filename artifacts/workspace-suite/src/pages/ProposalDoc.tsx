import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, ChevronRight, FileText, Layers, PenSquare,
  CheckCircle2, MessageSquareText, Printer, Plus, Trash2, Volume2, Search,
} from 'lucide-react';

/* ─────────── document content (real proposal, not placeholder lorem) ─────────── */

const DOC = {
  title: 'Catering Services Proposal — Blue Apple Contract Catering',
  breadcrumb: 'Proposals › Hospitality Sector › WE.18795',
  body: [
    `This proposal outlines the scope, pricing and service levels for Blue Apple Contract Catering's staff dining programme across its Manchester and Leeds sites, effective from the agreed start date for an initial 12-month term.`,
    `Nexus will provide day-to-day catering operations, menu planning, allergen management and monthly reporting. `,
    `The agreed management fee is £4,250 per site per month, inclusive of staffing, equipment servicing and compliance audits. Food cost is charged at net invoice plus an 8% handling margin, reviewed quarterly.`,
    `Either party may terminate this agreement with 90 days' written notice. Blue Apple Contract Catering retains the right to request a service review after the first 3 months of operation.`,
  ],
  highlight: 'The agreed management fee is £4,250 per site per month',
};

const TOP_TABS = [
  { icon: FileText, label: 'Details' },
  { icon: Layers, label: 'Pricing' },
  { icon: PenSquare, label: 'Drafts' },
  { icon: CheckCircle2, label: 'Signed' },
  { icon: MessageSquareText, label: 'Notes' },
];

const SUMMARY_CARDS = [
  { label: 'Status', value: 'In Review' },
  { label: 'Contract Value', value: '£51,000 / yr' },
  { label: 'Valid Until', value: '30 days' },
];

type Draft = {
  id: string;
  title: string;
  excerpt: string;
  step: number;
};

const INITIAL_DRAFTS: Draft[] = [
  { id: 'd1', title: 'Cover Letter', excerpt: 'A personal introduction addressed to the Blue Apple procurement team, referencing our site visit on 02 Jun.', step: 1 },
  { id: 'd2', title: 'Scope & Pricing', excerpt: 'Per-site management fee, food cost margin, and quarterly review clause drafted from the pricing sheet.', step: 2 },
  { id: 'd3', title: 'Terms & Conditions', excerpt: '90-day termination notice, liability caps, and the 3-month service review checkpoint.', step: 3 },
];

/* ─────────── draggable draft card ─────────── */

function DraftCard({
  draft,
  onDragStart,
}: {
  draft: Draft;
  onDragStart: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      draggable
      onDragStart={() => onDragStart(draft.id)}
      whileHover={{ y: -2 }}
      className="w-[180px] shrink-0 cursor-grab rounded-[10px] border border-gray-200 bg-white p-4 shadow-sm active:cursor-grabbing"
    >
      <span className="mb-2 inline-block rounded-full bg-[#eafaf1] px-2 py-0.5 text-[10px] font-semibold text-[#219251]">
        Draft {draft.step}
      </span>
      <p className="text-[13px] font-semibold text-gray-800 leading-tight">{draft.title}</p>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-gray-400 line-clamp-4">{draft.excerpt}</p>
    </motion.div>
  );
}

/* ─────────── main page ─────────── */

export function ProposalDoc() {
  const [activeTab, setActiveTab] = useState(2); // Drafts
  const [drafts, setDrafts] = useState<Draft[]>(INITIAL_DRAFTS);
  const [trashed, setTrashed] = useState<Draft | null>(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);
  const draggingId = useRef<string | null>(null);

  const handleDrop = () => {
    setDragOverTrash(false);
    const id = draggingId.current;
    if (!id) return;
    const found = drafts.find((d) => d.id === id);
    if (!found) return;
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setTrashed(found);
    draggingId.current = null;
  };

  const undoTrash = () => {
    if (!trashed) return;
    setDrafts((prev) => [...prev, trashed]);
    setTrashed(null);
  };

  const addDraft = () => {
    const n = drafts.length + trashed ? drafts.length + 1 : 1;
    setDrafts((prev) => [
      ...prev,
      { id: `d${Date.now()}`, title: 'Untitled Draft', excerpt: 'New section — click to start writing.', step: n },
    ]);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-[#0a0a0a] px-6 py-8 flex justify-center">
      <div className="w-full max-w-[1180px] overflow-hidden rounded-[18px] bg-[#f4f5f7] shadow-2xl ring-1 ring-white/10">

        {/* ── top bar ── */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <button className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-8">
            {TOP_TABS.map((tab, i) => {
              const Icon = tab.icon;
              const active = activeTab === i;
              return (
                <button
                  key={tab.label}
                  onClick={() => setActiveTab(i)}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                      active ? 'bg-[#2ecc71] text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`text-[10.5px] font-medium ${active ? 'text-[#219251]' : 'text-gray-400'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
              <Printer className="h-4 w-4" />
            </button>
            <button className="rounded-full bg-[#2ecc71] px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#27af61] transition-colors">
              PUBLISH
            </button>
          </div>
        </div>

        {/* ── body ── */}
        <div className="grid grid-cols-[1fr_360px] gap-8 p-8">

          {/* left: document */}
          <div className="rounded-[14px] bg-white p-9 shadow-sm">
            <div className="flex items-start gap-3">
              <button className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 hover:bg-gray-100">
                <Volume2 className="h-3.5 w-3.5" />
              </button>
              <div>
                <h1 className="text-[21px] font-bold leading-snug text-gray-900">{DOC.title}</h1>
                <p className="mt-1.5 flex items-center gap-1 text-[12px] text-gray-400">
                  {DOC.breadcrumb.split('›').map((part, i, arr) => (
                    <span key={i} className="flex items-center gap-1">
                      {part.trim()}
                      {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            <button className="mt-5 flex h-7 w-7 items-center justify-center rounded-full text-gray-300 hover:bg-gray-100">
              <Search className="h-3.5 w-3.5" />
            </button>

            <div className="mt-4 space-y-4 text-[13.5px] leading-[1.9] text-gray-600">
              {DOC.body.map((para, i) => {
                if (!para.includes(DOC.highlight)) {
                  return <p key={i}>{para}</p>;
                }
                const [before, after] = para.split(DOC.highlight);
                return (
                  <p key={i}>
                    {before}
                    <span className="rounded-[3px] bg-[#c7f9dd] px-0.5 text-gray-800">{DOC.highlight}</span>
                    {after}
                  </p>
                );
              })}
            </div>
          </div>

          {/* right: summary + drafts */}
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-3">
              {SUMMARY_CARDS.map((card) => (
                <div key={card.label} className="rounded-[10px] bg-white p-3 shadow-sm">
                  <p className="text-[9.5px] font-semibold uppercase tracking-wide text-gray-400">{card.label}</p>
                  <p className="mt-1 text-[12.5px] font-semibold text-gray-800 leading-tight">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <AnimatePresence mode="popLayout">
                {drafts.map((draft) => (
                  <DraftCard key={draft.id} draft={draft} onDragStart={(id) => (draggingId.current = id)} />
                ))}
              </AnimatePresence>

              <button
                onClick={addDraft}
                className="flex h-[128px] w-[180px] shrink-0 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-[#2ecc71] hover:text-[#219251]"
              >
                <Plus className="h-5 w-5" />
                <span className="text-[11px] font-medium">Create draft</span>
              </button>
            </div>

            {/* trash / delete drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTrash(true);
              }}
              onDragLeave={() => setDragOverTrash(false)}
              onDrop={handleDrop}
              className={`mt-2 flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed py-6 text-center transition-colors ${
                dragOverTrash ? 'border-red-400 bg-red-50 text-red-500' : 'border-gray-200 text-gray-300'
              }`}
            >
              <Trash2 className="h-5 w-5" />
              <span className="text-[11px]">Drop your drafts here to delete</span>
            </div>

            {trashed && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-[8px] bg-white px-4 py-2.5 text-[12px] text-gray-500 shadow-sm"
              >
                <span>"{trashed.title}" moved to trash</span>
                <button onClick={undoTrash} className="font-semibold text-[#219251] hover:underline">
                  Undo
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProposalDoc;
