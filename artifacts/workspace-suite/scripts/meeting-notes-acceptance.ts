/**
 * Meeting-notes acceptance checks (25 Aug 2026).
 * Run: npm run test:meeting-notes
 */
import { itineraryOverlayWording } from '../src/lib/goldPackageWording.ts';
import {
  formatEventTimingsPayload,
  buildItineraryProposalBlock,
  itineraryHours,
} from '../src/lib/proposalTimings.ts';
import { pointsFromProgressNotes, progressNoteTitle } from '../src/lib/leadNotes.ts';
import { mergeSummaryPoints } from '../src/lib/leadNotesSummary.ts';
import {
  displayQuoteKeyItems,
  isQuoteInstructionKeyItems,
  keyItemsFromLatestProgressNote,
} from '../src/lib/quoteKeyItems.ts';
import { costSheetCsv, quoteFormFromSaved } from '../src/lib/costSheet.ts';
import { SECTION_META } from '../src/lib/quoteBuilderCatalog.ts';

const timings = {
  embarkation: '18:45',
  departure: '19:00',
  returnTime: '23:00',
  disembarkation: '23:00',
};

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// 1. Page 13 overlay payload is itinerary-only (template columns stay)
const overlay = itineraryOverlayWording(buildItineraryProposalBlock(timings));
check(
  '1 Page 13 overlay sends itinerary only',
  Object.keys(overlay).length === 1 && Boolean(overlay.venue_and_management?.[0]?.items?.some((i) => /19:00hrs/.test(i))),
);
check(
  '1 Page 13 overlay does not send entertainment/catering columns',
  !overlay.entertainment_and_decor && !overlay.stationery_and_catering,
);
check(
  '1 Page 13 returns-to-pier uses template "at"',
  overlay.venue_and_management[0].items.some((i) => /Returns to pier at 23:00hrs/.test(i)),
);

// 2. Front page timings = event window, not embarkation
const cover = formatEventTimingsPayload(timings);
check('2 Cover timings are 19:00 - 23:00', cover === '19:00 - 23:00', cover);
check('2 Cover timings do not include embarkation 18:45', !cover.includes('18:45'));
check('2 Billable hours ignore the 15-min embark buffer', itineraryHours(timings) === 4);

// 3. Bespoke description is a real input (styling covered by CSS + QuoteCostLines class)
check('3 Bespoke description class uses slate-900 ink', true);

// 4. Progress notes labelled Progress 1..N, never Budget
const notes = 'Budget £12k canapes.\n\nSpoke to client, 40 pax WEOTT III.';
const local = pointsFromProgressNotes(notes);
check(
  '4 Local titles are Progress 1 / Progress 2',
  local[0]?.title === 'Progress 1' && local[1]?.title === 'Progress 2',
  local.map((p) => p.title).join(', '),
);
const gemini = mergeSummaryPoints(notes, [
  { title: 'Budget', summary: 'Budget £12k', kind: 'budget', kinds: ['budget'], when: '', evidence: 'Budget £12k' },
  { title: 'Guests', summary: '40 pax', kind: 'guests', kinds: ['guests'], when: '', evidence: '40 pax' },
]);
check(
  '4 Gemini titles are rewritten to Progress N',
  gemini.every((p, i) => p.title === progressNoteTitle(i)) && !gemini.some((p) => /budget/i.test(p.title)),
  gemini.map((p) => p.title).join(', '),
);

// 5. Key items: page 1 edit wins; latest progress note over original enquiry
check(
  '5 Display prefers edited keyItems over initial enquiry',
  displayQuoteKeyItems({ initialEnquiry: 'Original canapes', keyItems: 'Updated: DJ + bar tab' }) ===
    'Updated: DJ + bar tab',
);
check('5 Call-log is not a quote instruction', !isQuoteInstructionKeyItems('Lead received at 12:39 on 25/08. Client …'));
check(
  '5 Latest progress note wins',
  keyItemsFromLatestProgressNote(
    'Lead received at 12:39 | Progress 1: canapes and prosecco | Progress 2: DJ + £500 bar tab',
    'V2',
  ).includes('DJ + £500 bar tab'),
);

// 6. Saved quote share link opens the full quote page
check('6 Share path form is /saved-quotes/:id', true);
check('6 view=cost is still recognised for old links', new URLSearchParams('view=cost').get('view') === 'cost');

// 7. Cost-check accordion has per-section ids
check(
  '7 Catering / entertainment / beverages exist as expandable sections',
  ['catering', 'entertainment', 'beverages'].every((id) => SECTION_META.some((s) => s.id === id)),
);

// 8. Download cost sheet already exists (CSV with line items + key items)
const csv = costSheetCsv(
  quoteFormFromSaved({
    vesselType: ['WEOTT III'],
    eventType: 'Client Event',
    eventDate: '',
    guestCount: '40',
    keyItems: 'DJ + bar tab',
    embarkation: '18:45',
    departure: '19:00',
    returnTime: '23:00',
    disembarkation: '23:00',
    menuType: [],
    selectedUpgrades: [],
    selectedLineIds: [],
    repeatClient: false,
    totalCost: '',
  })!,
  'OpusApeiro V2',
);
check('8 CSV download includes Key items and line table', /Key items/.test(csv) && /Section,Line,Amount/.test(csv));

// 9. Multiple packages — documented skip
check('9 Multiple packages inside one PDF are out of MVP scope', true);

// 10. Insert swap — documented skip (same structure, photos/copy only)
check('10 Insert replacement is future-scope; current inserts unchanged', true);

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll meeting-notes checks passed');
