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
} from '../src/lib/quoteReview.ts';
import { quoteSharePlainText, quoteShareWebUrl } from '../src/lib/quoteShare.ts';
import { quotePageHtml, quotePageFileStem } from '../src/lib/quotePageHtml.ts';
import { savedQuoteSharePath } from '../src/lib/savedQuotesStore.ts';
import { parseGuestCountDetailed } from '../src/lib/parseGuestCount.ts';
import { formatEventTimingsPayload, itineraryHours } from '../src/lib/proposalTimings.ts';
import { isEventDateTbc } from '../src/lib/quoteFinance.ts';
import { errorMessage } from '../src/lib/errors.ts';
import { formatGbp } from '../src/lib/utils.ts';
import {
  humanizeEngineWarning,
  isLayoutOverflowOnly,
  layoutOverflowMessages,
} from '../src/lib/engineWarnings.ts';
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

const shareUrl = 'https://nexus.example/saved-quotes/q-lily';
const text = quoteSharePlainText(pending, shareUrl);
check('unit share greeting is generic Hi,', text.startsWith('Hi,\n'));
check('unit share does not greet the lead by first name', !text.includes('Hi Lily'));
check('unit share does not put lead email in the body as To', !text.toLowerCase().includes('to: lily@example.com'));
check('unit share includes full quote URL', text.includes(shareUrl));

const gmail = quoteShareWebUrl('email', { title: 'Quote: Lily Day V1', text, shareUrl });
check('unit Gmail compose has no to=', !/[?&]to=/.test(gmail));
check('unit Gmail compose does not include lead email', !gmail.includes(encodeURIComponent('lily@example.com')));
check('unit WhatsApp compose has no recipient phone', quoteShareWebUrl('whatsapp', { title: 't', text, shareUrl }).startsWith('https://web.whatsapp.com/send?text='));

const html = quotePageHtml(pending, shareUrl);
check('unit quote page HTML is the quote title', html.includes('Lily Day V1'));
check('unit quote page HTML includes share URL', html.includes(shareUrl));
check('unit quote page HTML includes key items', html.includes('DJ + bar tab'));
check('unit quote page file stem', quotePageFileStem(pending) === 'WE.19108-quote');
check('unit share path is /saved-quotes/:id', savedQuoteSharePath('q-lily').endsWith('/saved-quotes/q-lily'));

check('unit guest range without quote number is ambiguous', parseGuestCountDetailed({ groupSize: '50 - 65' }).ambiguous === true);
check('unit single guest number parses', parseGuestCountDetailed({ groupSize: '40 guests' }).value === '40');
check('unit empty guests stay empty', parseGuestCountDetailed({}).value === '' && parseGuestCountDetailed({}).ambiguous === true);

check('unit cover timings are event window not embark', formatEventTimingsPayload({ embarkation: '18:45', departure: '19:00', returnTime: '23:00' }) === '19:00 - 23:00');
check('unit billed hours ignore embark buffer', itineraryHours({ embarkation: '18:45', departure: '19:00', returnTime: '23:00' }) === 4);
check('unit missing event date is TBC', isEventDateTbc(undefined as unknown as string) === true);
check('unit TBC date string', isEventDateTbc('TBC') === true);
check('unit formatGbp', formatGbp(3256.15) === '£3256.15' || formatGbp(3256.15) === '£3256.15');
check('unit errorMessage from Error', errorMessage(new Error('boom')) === 'boom');
check('unit errorMessage fallback', errorMessage(null) === 'Something went wrong');

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
