import type { LucideIcon } from 'lucide-react';
import {
  Anchor,
  Calendar,
  CircleDollarSign,
  Clock,
  GitBranch,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Phone,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Sun,
  Trash2,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { POINT_KINDS, pointKindMeta, type NotePoint, type PointKind } from '@/lib/leadNotes';

export const NOTES_BLUE = '#2F7CF6';
export const NOTES_LINE = '#C5D9F8';
export const NOTES_DOT = '#8BB6F0';
export const NOTES_CARD = '#F3F4F6';

const KIND_ICONS: Record<PointKind, LucideIcon> = {
  budget: CircleDollarSign,
  calls: Phone,
  research: Search,
  logistics: Anchor,
  pipeline: GitBranch,
  history: Clock,
  guests: Users,
  timing: Calendar,
  catering: UtensilsCrossed,
  enquiry: MessageSquareText,
  discovery: Sparkles,
  general: StickyNote,
};

export function NoteKindAvatar({
  kind,
  size = 28,
  className = '',
}: {
  kind: PointKind;
  size?: number;
  className?: string;
}) {
  const meta = pointKindMeta(kind);
  const Icon = KIND_ICONS[kind];
  return (
    <span
      title={meta.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white ${className}`}
      style={{ width: size, height: size, backgroundColor: meta.color }}
    >
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={2.25} />
    </span>
  );
}

export type TimelineCard = NotePoint & {
  editable?: boolean;
};

type Props = {
  cards: TimelineCard[];
  activeId: string | null;
  onSelect: (id: string) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onAdd: () => void;
  onSummarize: () => void;
  summarizing?: boolean;
  onEditBody?: (card: TimelineCard, value: string) => void;
  onDelete?: (card: TimelineCard) => void;
  footer?: (card: TimelineCard, active: boolean) => React.ReactNode;
  columns?: 1 | 2;
  emptyLabel?: string;
  children?: React.ReactNode;
};

export function LeadNotesTimeline({
  cards,
  activeId,
  onSelect,
  fullscreen,
  onToggleFullscreen,
  onAdd,
  onSummarize,
  summarizing,
  onEditBody,
  onDelete,
  footer,
  columns = 1,
  emptyLabel = 'No notes yet for this lead.',
  children,
}: Props) {
  const cols = columns === 2 && cards.length > 1 ? 2 : 1;
  const mid = Math.ceil(cards.length / cols);
  const groups = cols === 2 ? [cards.slice(0, mid), cards.slice(mid)] : [cards];

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-white"
      data-testid="lead-notes-timeline"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-1 scrollbar-thin" data-page-scroll>
        {cards.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-400">{emptyLabel}</p>
        ) : (
          <div className={cols === 2 ? 'grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10' : ''}>
            {groups.map((group, gi) => (
              <div key={`col-${gi}`} className="relative pl-8">
                <div
                  className="absolute bottom-6 left-[11px] top-6 w-px"
                  style={{ backgroundColor: NOTES_LINE }}
                  aria-hidden
                />
                <div className="flex flex-col gap-4">
                  {group.map((card) => (
                    <TimelineNoteCard
                      key={card.id}
                      card={card}
                      active={card.id === activeId}
                      onSelect={() => onSelect(card.id)}
                      onEditBody={onEditBody}
                      onDelete={onDelete}
                      footer={footer}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {children ? (
        <div className="absolute inset-x-3 bottom-[5.5rem] z-20 max-h-[50%] overflow-y-auto">{children}</div>
      ) : null}

      <button
        type="button"
        onClick={onAdd}
        aria-label="Add note"
        data-testid="lead-notes-add"
        className="absolute bottom-6 left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center text-white shadow-[0_10px_24px_rgba(47,124,246,0.38)] transition-transform hover:scale-[1.04] active:scale-95"
        style={{ backgroundColor: NOTES_BLUE, borderRadius: 18 }}
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-label={fullscreen ? 'Exit full screen' : 'Expand notes to full screen'}
        data-testid="lead-notes-expand"
        className="absolute bottom-[5.75rem] right-5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900 shadow-[0_4px_16px_rgba(15,23,42,0.12)] transition-transform hover:scale-105"
      >
        {fullscreen ? <Minimize2 className="h-4 w-4" strokeWidth={2.4} /> : <Maximize2 className="h-4 w-4" strokeWidth={2.4} />}
      </button>

      <button
        type="button"
        onClick={onSummarize}
        aria-label="Summarise all points"
        data-testid="lead-notes-summarize"
        className="absolute bottom-6 right-5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_4px_16px_rgba(15,23,42,0.12)] transition-transform hover:scale-105 disabled:opacity-50"
        disabled={summarizing}
      >
        <Sparkles className={`h-4 w-4 ${summarizing ? 'animate-pulse text-blue-500' : ''}`} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function TimelineNoteCard({
  card,
  active,
  onSelect,
  onEditBody,
  onDelete,
  footer,
}: {
  card: TimelineCard;
  active: boolean;
  onSelect: () => void;
  onEditBody?: (card: TimelineCard, value: string) => void;
  onDelete?: (card: TimelineCard) => void;
  footer?: (card: TimelineCard, active: boolean) => React.ReactNode;
}) {
  const kinds = (card.kinds.length ? card.kinds : [card.kind]).slice(0, 4);
  const canDelete = Boolean(onDelete && card.id !== 'enquiry');

  return (
    <div className="relative">
      <span
        className="absolute -left-8 top-7 z-[1] block rounded-full bg-white"
        style={
          active
            ? {
                width: 16,
                height: 16,
                left: -25,
                top: 28,
                backgroundColor: NOTES_BLUE,
                boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${NOTES_BLUE}`,
              }
            : {
                width: 12,
                height: 12,
                left: -23,
                top: 30,
                border: `2px solid ${NOTES_DOT}`,
                backgroundColor: '#fff',
              }
        }
        aria-hidden
      />
      <motion.div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        layout
        data-testid={`lead-note-card-${card.id}`}
        className="w-full cursor-pointer text-left"
        style={{ borderRadius: 22 }}
      >
        <motion.article
          layout
          className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          style={{
            borderRadius: 22,
            backgroundColor: active ? NOTES_BLUE : NOTES_CARD,
            padding: active ? '16px 18px 14px' : '15px 18px 16px',
            minHeight: active ? 128 : 86,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3
              className="min-w-0 truncate text-[15px] font-bold leading-tight tracking-[-0.01em]"
              style={{ color: active ? '#fff' : '#1a1d21' }}
            >
              {card.title}
            </h3>
            <span
              className="shrink-0 pt-0.5 text-[12px] font-medium"
              style={{ color: active ? 'rgba(255,255,255,0.78)' : '#9AA3AF' }}
            >
              {card.when}
            </span>
          </div>
          {active && onEditBody && card.editable ? (
            <textarea
              value={card.body}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onEditBody(card, e.target.value)}
              rows={3}
              className="mt-2 w-full resize-none bg-transparent text-[13px] leading-[1.55] text-white/95 outline-none placeholder:text-white/55"
            />
          ) : (
            <p
              className={`mt-1.5 text-[13px] leading-[1.5] ${active ? '' : 'line-clamp-2'}`}
              style={{ color: active ? 'rgba(255,255,255,0.92)' : '#6B7280' }}
            >
              {active ? card.body || card.summary : card.summary || card.body}
            </p>
          )}
          <AnimatePresence initial={false}>
            {active ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-4 flex items-end justify-between"
              >
                <div className="flex items-center pl-0.5">
                  {kinds.map((kind, i) => (
                    <NoteKindAvatar
                      key={`${card.id}-${kind}`}
                      kind={kind}
                      size={28}
                      className={i === 0 ? '' : '-ml-2'}
                    />
                  ))}
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    aria-label="Delete"
                    data-testid={`lead-note-delete-${card.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.(card);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white shadow-sm text-slate-500 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                ) : (
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white shadow-sm"
                    aria-hidden
                  >
                    <Sun className="h-4 w-4 text-slate-400" strokeWidth={2} />
                  </span>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
          {footer ? <div onClick={(e) => e.stopPropagation()}>{footer(card, active)}</div> : null}
        </motion.article>
      </motion.div>
    </div>
  );
}

export { POINT_KINDS, KIND_ICONS };
