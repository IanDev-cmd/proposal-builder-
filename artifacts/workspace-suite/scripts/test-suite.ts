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
import { editBespokeAmount } from '../src/lib/bespokeLines.ts';
import { PROPOSAL_INSERTS } from '../src/lib/proposalAssets.ts';
import {
  acceptQuoteVersion,
  findSavedQuoteByVersion,
  laterQuoteVersion,
  quoteVersionNumber,
} from '../src/lib/quoteBuilderCatalog.ts';
import { versionBlock } from '../src/lib/progressNotesFinance.ts';
import { parseQuoteVersionFromNotes, parseRequestedTimes } from '../src/lib/leadPrefill.ts';
import { formatEventTimingsPayload, itineraryHours, returnFromDisembarkation } from '../src/lib/proposalTimings.ts';
import { isEventDateTbc, isWeekendOrPeak } from '../src/lib/quoteFinance.ts';
import { buildRateParts, inferDayPeriod, inferGroupBracket, inferWeeklyPeriod } from '../src/lib/costMotherLookup.ts';
import { parseCalendarDate, parseClock } from '../src/lib/calendarWhen.ts';
import { inferTimeSlot } from '../src/lib/proposalPrefill.ts';
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
  proposalDownloadFilename,
  proposalDownloadFilenameFromLead,
  proposalFileStemFromLead,
  proposalFilenameFromRecord,
} from '../src/lib/proposalFilename.ts';
import { insertsForGenerate, resolveProposalInserts, resolveProposalTemplate } from '../src/lib/proposalPrefill.ts';
import { HOME_PATH, isHomeDashboardPath, isShareDeepLink, parseShareDeepLink } from '../src/lib/homeLanding.ts';
import { buildSyncRunContext, syncStatusLabel } from '../src/lib/syncManager.ts';
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
  'unit two-clock finish is disembark not return',
  parseRequestedTimes('18.00 - 22.00').disembarkation === '22:00' &&
    parseRequestedTimes('18.00 - 22.00').returnTime === '21:45',
);
check(
  'unit 12-hour lead times',
  parseRequestedTimes('6pm to 10pm').departure === '18:00' &&
    parseRequestedTimes('6pm to 10pm').disembarkation === '22:00' &&
    parseRequestedTimes('6pm to 10pm').returnTime === '21:45',
);
check('unit return defaults to disembark minus 15', returnFromDisembarkation('23:00') === '22:45');

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
check('unit Gmail body includes quote URL', gmail.includes(encodeURIComponent(shareUrl)));
check(
  'unit WhatsApp text includes quote URL',
  quoteShareWebUrl('whatsapp', { title: 't', text, shareUrl }).includes(encodeURIComponent(shareUrl)),
);
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
check(
  'unit new quotes start at V1 even when notes mention V2',
  parseQuoteVersionFromNotes('V1 - 100\nV2 - 70') === 'V1' &&
    parseQuoteVersionFromNotes('Requested times V2 18:00') === 'V1' &&
    parseQuoteVersionFromNotes('') === 'V1',
);

check(
  'unit cover timings are event window not embark',
  formatEventTimingsPayload({
    embarkation: '18:45',
    departure: '19:00',
    returnTime: '22:45',
    disembarkation: '23:00',
  }) === '19:00 - 23:00',
);
check(
  'unit cover timings ignore pier return',
  formatEventTimingsPayload({
    embarkation: '18:45',
    departure: '19:00',
    returnTime: '22:45',
    disembarkation: '23:00',
  }).includes('22:45') === false,
);
check('unit billed hours ignore embark buffer', itineraryHours({ embarkation: '18:45', departure: '19:00', returnTime: '23:00', disembarkation: '23:00' }) === 4);
check(
  'unit billed hours end at disembark not return',
  itineraryHours({ embarkation: '11:45', departure: '12:00', returnTime: '16:45', disembarkation: '17:00' }) === 5,
);
let bespokeDraft = '';
for (const ch of '172.50') bespokeDraft = editBespokeAmount(bespokeDraft + ch).text;
check('unit bespoke 172.50 stores 172.5', editBespokeAmount(bespokeDraft).amount === 172.5);
check(
  'unit bespoke trailing dot stays while typing',
  bespokeDraft === '172.50' && editBespokeAmount('172.').text === '172.',
);
check('unit bespoke empty amount is 0', editBespokeAmount('').amount === 0 && editBespokeAmount('').text === '');
check(
  'unit WEOTT III wedding reception is a vessel insert',
  PROPOSAL_INSERTS.some(
    (i) => i.kind === 'vessel' && i.vessel === 'WEOTT III' && i.label === 'WEOTT III - Wedding Reception',
  ),
);
check('unit any lead can use V5', acceptQuoteVersion('v5') === 'V5' && laterQuoteVersion('V5') === 'V5' && quoteVersionNumber('V5') === 5);
check('unit V version steps down to V1', quoteVersionNumber('V1') === 1 && quoteVersionNumber('BF Costs') === null);
check('unit any lead can use BF Costs', acceptQuoteVersion('bf costs') === 'BF Costs' && laterQuoteVersion('BF Costs') === null);
const versionQuotes = [
  { leadKey: 'lead-a', data: { quoteVersion: 'V5' } },
  { leadKey: 'lead-b', data: { quoteVersion: 'BF Costs' } },
];
check(
  'unit saved quote is found by exact version for any lead',
  findSavedQuoteByVersion(versionQuotes, 'lead-a', 'V5')?.data.quoteVersion === 'V5' &&
    findSavedQuoteByVersion(versionQuotes, 'lead-b', 'BF Costs')?.data.quoteVersion === 'BF Costs' &&
    findSavedQuoteByVersion(versionQuotes, 'lead-a', 'BF Costs') == null,
);
check(
  'unit BF Costs does not scope notes as a V number',
  versionBlock('V5 only | general note', 'BF Costs') === 'V5 only | general note',
);
check('unit missing event date is TBC', isEventDateTbc(undefined as unknown as string) === true);
check('unit TBC date string', isEventDateTbc('TBC') === true);
check('unit UK date is 7 Sep 2026', parseCalendarDate('07/09/2026') === '2026-09-07');
check('unit named Monday stays 7 Sep', parseCalendarDate('Monday 7th September 2026') === '2026-09-07');
check('unit TBC marker keeps the calendar day', parseCalendarDate('7 September 2026 (Date TBC)') === '2026-09-07');
check('unit clock 6pm', parseClock('6pm') === '18:00');
check(
  'unit flexible Monday is Mon to Thur',
  inferWeeklyPeriod('2026-09-07', true, 'London Rose') === 'Mon to Thur',
);
check(
  'unit Friday is Fri to Sun',
  inferWeeklyPeriod('Monday 11th September 2026', false, 'Avontuur') === 'Fri to Sun' ||
    inferWeeklyPeriod('2026-09-11', false, 'Avontuur') === 'Fri to Sun',
);
check('unit missing date does not invent Fri to Sun', inferWeeklyPeriod('', true, 'London Rose') === '');
check(
  'unit Elizabethan Wednesday is Mon to Wed',
  inferWeeklyPeriod('2026-09-09', true, 'Elizabethan') === 'Mon to Wed',
);
check(
  'unit Elizabethan Thursday is Thur to Sun',
  inferWeeklyPeriod('2026-09-10', false, 'Elizabethan') === 'Thur to Sun',
);
check('unit flexible Monday is not peak', isWeekendOrPeak('2026-09-07', true) === false);
check('unit Friday is peak', isWeekendOrPeak('2026-09-11', false) === true);
check('unit missing clock is not Daytime', inferDayPeriod('') === '');
check('unit 15:59 is Daytime', inferDayPeriod('15:59') === 'Daytime');
check('unit 4pm is Evening', inferDayPeriod('4pm') === 'Evening');
check('unit Dixie Queen uses Standard', inferGroupBracket(80, 'Dixie Queen') === 'Standard');
check('unit Dixie Queen 300 guests stays Standard', inferGroupBracket(300, 'Dixie Queen') === 'Standard');
check('unit Erasmus 200 uses the upper band', inferGroupBracket(200, 'Erasmus') === '200 to 335 guests');
check(
  'unit Dixie ignores a saved guest band',
  buildRateParts({
    vesselUi: 'Dixie Queen',
    groupBracket: '1 to 249 guests',
    guests: 40,
    weeklyPeriod: 'Thur to Sun',
    dayPeriod: 'Evening',
  }).groupBracket === 'Standard',
);
check('unit template slot uses 16:00', inferTimeSlot('16:00') === 'evening' && inferTimeSlot('12:00') === 'daytime');
check('unit template slot empty stays unset', inferTimeSlot('') === 'daytime_or_evening');
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
const grossDiscount = calcFinancials({
  ...sampleForm,
  selectedLineIds: [],
  totalCost: '10000',
  marginOverride: 0.25,
  repeatClient: true,
  discountPercent: '5',
  agentReferral: false,
});
check('unit 5% discount leaves the 25% margin', grossDiscount.marginAmount === 2500);
check('unit 5% discount is off the gross', grossDiscount.discountAmount === 625);
check('unit 5% discount cost to client', grossDiscount.costToClient === 11875);
check(
  'unit discount rows add back to the gross',
  grossDiscount.costToClient ===
    grossDiscount.costToClientBeforeDiscount - grossDiscount.discountAmount &&
    grossDiscount.updatedProfit === grossDiscount.marginAmount - grossDiscount.discountAmount &&
    grossDiscount.grand === grossDiscount.costToClient + grossDiscount.vat,
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
  }) === 'Proposal - Lily Day (OpusApeiro) - WE.19108_V1.pdf',
);
check(
  'unit PDF name omits empty company',
  proposalFileStemFromLead({ name: 'Lily Day', referenceNumber: 'WE.19108' }) ===
    'Proposal - Lily Day - WE.19108_V1',
);
check(
  'unit PDF name drops NA company',
  proposalFileStemFromLead({
    name: 'Katrina Watson',
    company: 'NA',
    referenceNumber: 'WE.19132',
  }) === 'Proposal - Katrina Watson - WE.19132_V1',
);
check(
  'unit PDF name drops dash placeholder company',
  proposalFileStemFromLead({
    name: 'Katrina Watson',
    company: '—',
    referenceNumber: 'WE.19132',
  }) === 'Proposal - Katrina Watson - WE.19132_V1',
);
check(
  'unit PDF name appends V2 once',
  proposalDownloadFilename({
    contactName: 'Rupali Patil Maria Evans',
    companyName: 'ITC Infotech',
    referenceCode: 'WE.19167',
    quoteVersion: 'V2',
  }) === 'Proposal - Rupali Patil Maria Evans (ITC Infotech) - WE.19167_V2.pdf',
);
check(
  'unit PDF name appends BF Costs',
  proposalDownloadFilename({
    contactName: 'Alexis King',
    referenceCode: 'WE.19001',
    quoteVersion: 'BF Costs',
  }) === 'Proposal - Alexis King - WE.19001_BF Costs.pdf',
);
check(
  'unit PDF name is Proposal - Joanna Eaton (EY) - WE.19103',
  proposalDownloadFilenameFromLead({
    name: 'Joanna Eaton',
    company: 'EY',
    referenceNumber: 'WE.19103',
  }) === 'Proposal - Joanna Eaton (EY) - WE.19103_V1.pdf',
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
  }) === 'Proposal - Joanna Eaton (EY) - WE.19103_V1.pdf',
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
  check(
    'unit Christmas evening pack resolves like other corporates',
    resolveProposalTemplate({
      proposalCategory: 'corporate',
      eventType: 'Christmas Event',
      embarkation: '18:00',
      departure: '18:00',
      disembarkation: '22:00',
      eventDate: '2026-12-12',
    }) === 'corporate/christmas_event/evening',
  );
  check(
    'unit Christmas daytime pack resolves like other corporates',
    resolveProposalTemplate({
      proposalCategory: 'corporate',
      eventType: 'Christmas Event',
      embarkation: '11:00',
      departure: '12:00',
      disembarkation: '16:00',
      eventDate: '2026-12-12',
    }) === 'corporate/christmas_event/daytime',
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
  'unit quote_date panel drift is not shown as raw coordinates',
  humanizeEngineWarning('cover.quote_date: x0 198.0 outside left panel').includes('quote date') &&
    !humanizeEngineWarning('cover.quote_date: x0 198.0 outside left panel').includes('198.0'),
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

check('unit home landing path is /home', HOME_PATH === '/home');
check(
  'unit home dashboard matches / and /home',
  isHomeDashboardPath('/') === true &&
    isHomeDashboardPath('/home') === true &&
    isHomeDashboardPath('/quote-builder') === false &&
    isHomeDashboardPath('/saved-quotes/abc') === false,
);
check('unit quote share path survives login', isShareDeepLink('/saved-quotes/q-lily') === true);
check('unit saved quotes list does not survive login', isShareDeepLink('/saved-quotes') === false);
check('unit proposal share query survives login', isShareDeepLink('/proposal-doc', '?id=p-1') === true);
check('unit proposal list does not survive login', isShareDeepLink('/proposal-doc') === false);
check('unit quote builder does not survive login', isShareDeepLink('/quote-builder') === false);
check(
  'unit parse quote deep link',
  parseShareDeepLink('/saved-quotes/q-lily')?.kind === 'quote' &&
    parseShareDeepLink('/saved-quotes/q-lily')?.id === 'q-lily',
);
check(
  'unit parse proposal deep link',
  parseShareDeepLink('/proposal-doc', '?id=p-1')?.kind === 'proposal' &&
    parseShareDeepLink('/proposal-doc', '?id=p-1')?.id === 'p-1',
);
check(
  'unit route to quote review is a deep-link sync',
  buildSyncRunContext('route', { path: '/saved-quotes/q-lily' }).reason === 'deep-link' &&
    buildSyncRunContext('route', { path: '/saved-quotes/q-lily' }).quoteId === 'q-lily',
);
check(
  'unit route to proposal share is a deep-link sync',
  buildSyncRunContext('route', { path: '/proposal-doc', search: '?id=p-1' }).proposalId === 'p-1',
);
check(
  'unit sync label offline is saved locally',
  syncStatusLabel({ online: false, phase: 'offline', pendingCount: 0 }) === 'Saved locally',
);
check(
  'unit sync label syncing',
  syncStatusLabel({ online: true, phase: 'syncing', pendingCount: 0 }) === 'Syncing...',
);
check(
  'unit sync label synced',
  syncStatusLabel({ online: true, phase: 'synced', pendingCount: 0 }) === 'Synced',
);
check(
  'unit sync label pending stays local',
  syncStatusLabel({ online: true, phase: 'synced', pendingCount: 1 }) === 'Saved locally',
);

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll layered tests passed');
