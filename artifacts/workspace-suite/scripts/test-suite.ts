/**
 * Layered tests: quote review, share (blank recipient), quote page HTML,
 * guest parsing, timings, errors, and financial helpers.
 * Run: npm test
 */
import {
  filterQuotesByReviewTab,
  pickReviewFields,
  quoteReviewLabel,
  quoteReviewStatus,
  quoteNeedsApprovalFirst,
} from '../src/lib/quoteReview.ts';
import { quoteSharePlainText, quoteShareWebUrl } from '../src/lib/quoteShare.ts';
import { quotePageHtml, quotePageFileStem } from '../src/lib/quotePageHtml.ts';
import { savedQuoteSharePath, isSavedQuoteReviewPath } from '../src/lib/savedQuotesStore.ts';
import { parseGuestCountDetailed } from '../src/lib/parseGuestCount.ts';
import { parseRequestedTimes } from '../src/lib/leadPrefill.ts';
import { formatEventTimingsPayload, itineraryHours } from '../src/lib/proposalTimings.ts';
import { isEventDateTbc } from '../src/lib/quoteFinance.ts';
import { formatEventDateForProposal } from '../src/lib/goldScenarioCover.ts';
import { errorMessage } from '../src/lib/errors.ts';
import { formatGbp, formatGbpPounds } from '../src/lib/utils.ts';
import {
  calcFinancials,
  calcSectionLines,
  type QuoteFormInput,
} from '../src/lib/quoteFinance.ts';
import {
  QUOTE_LINES,
  getQuoteLines,
  isNonCostEventVariable,
  setLiveCatalogLines,
} from '../src/lib/quoteBuilderCatalog.ts';
import {
  humanizeEngineWarning,
  isLayoutOverflowOnly,
  layoutOverflowMessages,
} from '../src/lib/engineWarnings.ts';
import {
  isAnonymousPdfFilename,
  isLegacyEventVesselProposalLabel,
  proposalDownloadFilenameFromLead,
  proposalFileStemFromLead,
  proposalFilenameFromRecord,
} from '../src/lib/proposalFilename.ts';
import { insertsForGenerate, resolveProposalInserts } from '../src/lib/proposalPrefill.ts';
import type { SavedQuote } from '../src/lib/savedQuotesStore.ts';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function stubQuote(over: Partial<SavedQuote> = {}): SavedQuote {
  return {
    id: 'q-lily',
    savedAt: '2026-08-25T12:00:00.000Z',
    leadKey: 'lead-1',
    leadName: 'Lily Day',
    referenceNumber: 'WE.19108',
    title: 'Lily Day V1',
    vesselType: 'WEOTT III',
    eventType: 'Client Event',
    guestCount: '40',
    eventDate: '2026-08-25',
    grandTotal: 3256.15,
    step: 6,
    data: {
      eventDate: '2026-08-25',
      guestCount: '40',
      vesselType: ['WEOTT III'],
      eventType: 'Client Event',
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
    },
    lead: null,
    reviewStatus: 'pending',
    ...over,
  };
}

const pending = stubQuote();
const approved = stubQuote({ id: 'q-ok', reviewStatus: 'approved', reviewedAt: '2026-08-25T13:00:00.000Z' });
const disapproved = stubQuote({ id: 'q-no', reviewStatus: 'disapproved', reviewedAt: '2026-08-25T14:00:00.000Z' });
const legacy = stubQuote({ id: 'q-old', reviewStatus: undefined });

check('unit review unknown status is pending', quoteReviewStatus({ reviewStatus: 'nope' as never }) === 'pending');
check('unit review missing status is pending', quoteReviewStatus(legacy) === 'pending');
check('unit review labels', quoteReviewLabel('approved') === 'Approved' && quoteReviewLabel('disapproved') === 'Disapproved');
check(
  'unit All Quotes tab is pending-only',
  filterQuotesByReviewTab([pending, approved, disapproved, legacy], 'pending').every((q) => q.id === 'q-lily' || q.id === 'q-old') &&
    filterQuotesByReviewTab([pending, approved, disapproved, legacy], 'pending').length === 2,
);
check('unit approved tab', filterQuotesByReviewTab([pending, approved, disapproved], 'approved').map((q) => q.id).join() === 'q-ok');
check('unit disapproved tab', filterQuotesByReviewTab([pending, approved, disapproved], 'disapproved').map((q) => q.id).join() === 'q-no');

const picked = pickReviewFields(
  { reviewStatus: 'pending' },
  { reviewStatus: 'approved', reviewedAt: '2026-08-25T15:00:00.000Z' },
);
check('unit later reviewedAt wins merge', picked.reviewStatus === 'approved');
check(
  'unit cost approval on the quote suppresses generate warning',
  quoteNeedsApprovalFirst(stubQuote({ data: { ...pending.data, costApproved: true } })) === false,
);
check(
  'unit cost-approved quote is on Approved Quotes tab',
  filterQuotesByReviewTab(
    [stubQuote({ id: 'q-cost', data: { ...pending.data, costApproved: true } })],
    'approved',
  ).map((q) => q.id).join() === 'q-cost',
);

check(
  'unit labeled embark times from lead sheet',
  parseRequestedTimes('Embark 17:45 Depart 18:00 Return 22:00 Disembark 22:15').embarkation === '17:45' &&
    parseRequestedTimes('Embark 17:45 Depart 18:00 Return 22:00 Disembark 22:15').departure === '18:00',
);
check(
  'unit dotted clocks parse as event window then embark-15',
  parseRequestedTimes('18.00 - 22.00').departure === '18:00' &&
    parseRequestedTimes('18.00 - 22.00').embarkation === '17:45',
);
check(
  'unit 12-hour lead times',
  parseRequestedTimes('6pm to 10pm').departure === '18:00' &&
    parseRequestedTimes('6pm to 10pm').returnTime === '22:00',
);

const shareUrl = 'https://nexus.example/saved-quotes/q-lily';
const text = quoteSharePlainText(pending, shareUrl);
check('unit share greeting is generic Hi,', text.startsWith('Hi,\n'));
check('unit share does not greet the lead by first name', !text.includes('Hi Lily'));
check('unit share does not put lead email in the body as To', !text.toLowerCase().includes('to: lily@example.com'));
check('unit share includes full quote URL', text.includes(shareUrl));

const gmail = quoteShareWebUrl('email', { title: 'Quote: Lily Day V1', text, shareUrl });
check('unit Gmail compose has no to=', !/[?&]to=/.test(gmail));
check('unit Gmail compose does not include lead email', !gmail.includes(encodeURIComponent('lily@example.com')));
check('unit Gmail is Gmail web', gmail.startsWith('https://mail.google.com/mail/'));
check('unit WhatsApp compose has no recipient phone', quoteShareWebUrl('whatsapp', { title: 't', text, shareUrl }).startsWith('https://web.whatsapp.com/send?text='));
check('unit WhatsApp is WhatsApp Web not wa.me', !quoteShareWebUrl('whatsapp', { title: 't', text, shareUrl }).includes('wa.me'));
check('unit Drive is Google Drive web', quoteShareWebUrl('drive', { title: 't', text, shareUrl }).startsWith('https://drive.google.com/'));
check('unit Dropbox is Dropbox web', quoteShareWebUrl('dropbox', { title: 't', text, shareUrl }) === 'https://www.dropbox.com/home');

const html = quotePageHtml(pending, shareUrl);
check('unit quote page HTML is the quote title', html.includes('Lily Day V1'));
check('unit quote page HTML includes share URL', html.includes(shareUrl));
check('unit quote page HTML includes key items', html.includes('DJ + bar tab'));
check('unit quote page file stem', quotePageFileStem(pending) === 'WE.19108-quote');
check('unit share path is /saved-quotes/:id', savedQuoteSharePath('q-lily').endsWith('/saved-quotes/q-lily'));
check(
  'unit quote review path hides app nav',
  isSavedQuoteReviewPath('/saved-quotes/quote-WE.19076-V3') === true &&
    isSavedQuoteReviewPath('/saved-quotes') === false &&
    isSavedQuoteReviewPath('/saved-quotes/') === false,
);

check('unit guest range without quote number is ambiguous', parseGuestCountDetailed({ groupSize: '50 - 65' }).ambiguous === true);
check('unit single guest number parses', parseGuestCountDetailed({ groupSize: '40 guests' }).value === '40');
check('unit empty guests stay empty', parseGuestCountDetailed({}).value === '' && parseGuestCountDetailed({}).ambiguous === true);

check('unit cover timings are event window not embark', formatEventTimingsPayload({ embarkation: '18:45', departure: '19:00', returnTime: '23:00' }) === '19:00 - 23:00');
check('unit billed hours ignore embark buffer', itineraryHours({ embarkation: '18:45', departure: '19:00', returnTime: '23:00', disembarkation: '23:00' }) === 4);
check(
  'unit billed hours end at disembark not return',
  itineraryHours({ embarkation: '11:45', departure: '12:00', returnTime: '16:45', disembarkation: '17:00' }) === 5,
);
check('unit missing event date is TBC', isEventDateTbc(undefined as unknown as string) === true);
check('unit TBC date string', isEventDateTbc('TBC') === true);
check(
  'unit flexible cover date uses (Date TBC) once',
  formatEventDateForProposal({ eventDate: '2026-08-26', dateFlexible: true }) ===
    'Wednesday 26th August 2026\n(Date TBC)',
);
check(
  'unit fixed cover date has no TBC line',
  formatEventDateForProposal({ eventDate: '2026-08-26', dateFlexible: false }) ===
    'Wednesday 26th August 2026',
);
check('unit formatGbp', formatGbp(3256.15) === '£3256.15' || formatGbp(3256.15) === '£3256.15');
check('unit formatGbpPounds rounds to whole pounds', formatGbpPounds(4453.96) === '£4,454');

const twoIdx = QUOTE_LINES.findIndex((l) => l.label.startsWith('Two Course Seated Dinner'));
const threeIdx = QUOTE_LINES.findIndex((l) => l.label.startsWith('Three Course Seated Dinner'));
check('unit two-course sits above three-course', twoIdx >= 0 && twoIdx < threeIdx);

const festive = QUOTE_LINES.find((l) => l.id === 'decor_table_festive_crackers');
check('unit festive crackers live title', festive?.label === 'Festive Crackers/Mini Chocolates');

const drinks = QUOTE_LINES.find((l) => l.label === 'Unlimited Drinks');
const drinksP = QUOTE_LINES.find((l) => l.label === 'Unlimited Drinks (with Prosecco)');
const wifi = QUOTE_LINES.find((l) => l.label === 'Onboard WiFi');
const chefs = QUOTE_LINES.find((l) => l.label === 'Additional Chefs x 2 (for all seated dinners)');
check('unit unlimited drinks multiplier', drinks?.multiplier === 'guests_hours');
check('unit unlimited drinks prosecco multiplier', drinksP?.multiplier === 'guests_hours');
check('unit onboard wifi multiplier', wifi?.multiplier === 'guests');
check('unit additional chefs multiplier', chefs?.multiplier === 'hours');

const sampleForm: QuoteFormInput = {
  vesselType: ['London Rose'],
  eventType: 'Corporate',
  eventDate: '2026-08-28',
  guestCount: '60',
  embarkation: '11:45',
  departure: '12:00',
  returnTime: '16:00',
  disembarkation: '16:00',
  menuType: [],
  selectedUpgrades: [],
  selectedLineIds: [drinks?.id || '', drinksP?.id || '', wifi?.id || '', chefs?.id || ''].filter(Boolean),
  repeatClient: false,
  totalCost: '',
};
const sampleLines = calcSectionLines(sampleForm).lines;
const amt = (label: string) => sampleLines.find((l) => l.label === label)?.amount;
check('unit unlimited drinks 60x4x10', amt('Unlimited Drinks') === 2400);
check('unit unlimited drinks prosecco 60x4x13.75', amt('Unlimited Drinks (with Prosecco)') === 3300);
check('unit onboard wifi 60x2', amt('Onboard WiFi') === 120);
check('unit additional chefs 4x85', amt('Additional Chefs x 2 (for all seated dinners)') === 340);

const finRound = calcFinancials({
  ...sampleForm,
  selectedLineIds: [],
  totalCost: '17815.84',
  marginOverride: 0.25,
});
check('unit margin nearest pound', finRound.marginAmount === 4454);
check('unit cost to client nearest pound', finRound.costToClient === 22270);
check('unit vat nearest pound', finRound.vat === 4454);
check('unit grand nearest pound', finRound.grand === 26724);

const togglesOff = calcFinancials({
  ...sampleForm,
  selectedLineIds: [],
  totalCost: '10000',
  marginOverride: 0.25,
  repeatClient: false,
  discountPercent: '10',
  agentReferral: false,
  commissionPercent: '5',
});
check(
  'unit off toggles ignore leftover discount and commission',
  togglesOff.discountAmount === 0 && togglesOff.commissionAmount === 0,
);
const togglesOn = calcFinancials({
  ...sampleForm,
  selectedLineIds: [],
  totalCost: '10000',
  marginOverride: 0.25,
  repeatClient: true,
  discountPercent: '10',
  agentReferral: true,
  commissionPercent: '5',
});
check(
  'unit on toggles apply discount and commission',
  togglesOn.discountAmount > 0 && togglesOn.commissionAmount > 0,
);

setLiveCatalogLines([
  { label: 'Barbecue', section: 'catering', multiplier: 'guests' },
  {
    label: 'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
    section: 'catering',
    multiplier: 'guests',
  },
  { label: 'Three Course Seated Dinner (All Seasons)', section: 'catering', multiplier: 'guests' },
  { label: 'Catering Delivery Charge (In every quote)', section: 'catering', multiplier: 'set' },
  { label: 'Festive Crackers/Mini Chocolates', section: 'decor_table', multiplier: 'guests' },
  { label: 'No. of Tables', section: 'other', multiplier: 'set' },
]);
const live = getQuoteLines();
const cateringLive = live.filter((l) => l.section === 'catering').map((l) => l.label);
const twoLive = cateringLive.indexOf(
  'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
);
const threeLive = cateringLive.indexOf('Three Course Seated Dinner (All Seasons)');
const deliveryLive = cateringLive.indexOf('Catering Delivery Charge (In every quote)');
check('unit live catalog excludes no of tables', !live.some((l) => isNonCostEventVariable(l.label)));
check('unit live two-course before three-course', twoLive >= 0 && twoLive < threeLive);
check('unit live two-course before delivery', twoLive >= 0 && twoLive < deliveryLive);
check(
  'unit live festive title overlay',
  live.some((l) => l.id === 'decor_table_festive_crackers' && l.label === 'Festive Crackers/Mini Chocolates'),
);
setLiveCatalogLines(null);
check('unit errorMessage from Error', errorMessage(new Error('boom')) === 'boom');
check('unit errorMessage fallback', errorMessage(null) === 'Something went wrong');
check(
  'unit PDF name is Proposal - Name (Company) - REF',
  proposalDownloadFilenameFromLead({
    name: 'Lily Day',
    company: 'OpusApeiro',
    referenceNumber: 'WE.19108',
  }) === 'Proposal - Lily Day (OpusApeiro) - WE.19108.pdf',
);
check(
  'unit PDF name omits empty company',
  proposalFileStemFromLead({ name: 'Lily Day', referenceNumber: 'WE.19108' }) ===
    'Proposal - Lily Day - WE.19108',
);
check(
  'unit PDF name is Proposal - Joanna Eaton (EY) - WE.19103',
  proposalDownloadFilenameFromLead({
    name: 'Joanna Eaton',
    company: 'EY',
    referenceNumber: 'WE.19103',
  }) === 'Proposal - Joanna Eaton (EY) - WE.19103.pdf',
);
check(
  'unit blob UUID is not kept as a PDF name',
  isAnonymousPdfFilename('8082d3e5-aed6-4e8b-9369-a535765a7bcb') === true,
);
check(
  'unit UUID download is rebuilt from the lead',
  proposalFilenameFromRecord({
    filename: '8082d3e5-aed6-4e8b-9369-a535765a7bcb',
    leadName: 'Joanna Eaton',
    leadCompany: 'EY',
    referenceNumber: 'WE.19103',
  }) === 'Proposal - Joanna Eaton (EY) - WE.19103.pdf',
);
{
  const xmas = resolveProposalInserts({
    category: 'corporate',
    eventType: 'Christmas Event',
    vesselHint: 'WEOTT VI (Elizabethan)',
    eventDate: '2026-12-12',
    embarkation: '18:00',
    disembarkation: '22:00',
  });
  const summer = resolveProposalInserts({
    category: 'corporate',
    eventType: 'Summer Event',
    vesselHint: 'WEOTT VI (Elizabethan)',
    eventDate: '2026-06-12',
    embarkation: '12:00',
    disembarkation: '16:00',
  });
  check(
    'unit WEOTT VI Christmas picks Christmas insert',
    xmas.selectedInserts.includes('weott_vi_christmas_daytime_or_evening'),
  );
  check(
    'unit WEOTT VI Christmas does not pick except-Christmas insert',
    !xmas.selectedInserts.includes('weott_vi_any_season_except_christmas_daytime_or_evening'),
  );
  check(
    'unit WEOTT VI summer picks except-Christmas insert',
    summer.selectedInserts.includes('weott_vi_any_season_except_christmas_daytime_or_evening'),
  );
  check(
    'unit WEOTT VI summer does not pick WEOTT VII insert',
    !summer.selectedInserts.some((id) => id.includes('weott_vii')),
  );
  const weottIiSummer = resolveProposalInserts({
    category: 'corporate',
    eventType: 'Summer Event',
    vesselHint: 'WEOTT II (Avontuur)',
    eventDate: '2026-06-12',
    embarkation: '12:00',
    disembarkation: '16:00',
  });
  check(
    'unit WEOTT II summer picks WEOTT II vessel insert',
    weottIiSummer.selectedInserts.some((id) => id.startsWith('weott_ii_')),
  );
  const generatedInserts = insertsForGenerate({
    requiresInserts: false,
    selectedInserts: [],
    proposalCategory: 'corporate',
    eventType: 'Summer Event',
    vesselType: ['WEOTT II (Avontuur)'],
    eventDate: '2026-06-12',
    embarkation: '12:00',
    departure: '12:00',
    disembarkation: '16:00',
  });
  check(
    'unit generate still attaches WEOTT II vessel insert when inserts were skipped',
    generatedInserts.some((id) => id.startsWith('weott_ii_')),
  );
}

check(
  'unit event-vessel cards are legacy',
  isLegacyEventVesselProposalLabel('Christmas Event Proposal — WEOTT II (Avontuur)') === true &&
    isLegacyEventVesselProposalLabel('Wedding Reception Proposal — Vessel TBC') === true &&
    isLegacyEventVesselProposalLabel('Award Ceremony Proposal — WEOTT II (Avontuur)') === true &&
    isLegacyEventVesselProposalLabel('Proposal - Joanna Eaton (EY) - WE.19103.pdf') === false,
);

check(
  'unit telephone shrink becomes a specific cover error',
  humanizeEngineWarning(
    "[telephone] '020 1234 5678 / 07700 900000' had to shrink from 7.5pt to 4.2pt to fit its box -- flagging for manual review.",
  ) === 'The telephone number is too long for the cover field.',
);
check(
  'unit overflow warnings are collected without the generic 422 copy',
  layoutOverflowMessages([
    "[email] 'ops@averylongorganisationname.co.uk' had to shrink from 7.5pt to 5.1pt",
  ])[0] === 'The email address is too long for the cover field.',
);
check(
  'unit layout overflow-only 422 can be distinguished',
  isLayoutOverflowOnly(['cover.telephone: had to shrink from 7.5pt to 4pt']) === true,
);

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll layered tests passed');
