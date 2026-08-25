/**
 * Backend URLs for WEOTT proposal generation.
 * UI talks to n8n; n8n calls the proposal engine /generate endpoint.
 *
 * Live n8n: prometheus5.app.n8n.cloud
 * instanceId: 7edf9dbd0dc2afcd47af5b8da39c5d58dbe322ad798898e460ad228e7ae73b4a
 */
export const PROPOSAL_ENGINE_URL = 'https://weott-proposal-engine.onrender.com';
export const PROPOSAL_ENGINE_GENERATE_URL = `${PROPOSAL_ENGINE_URL}/generate`;

export const N8N_BASE = 'https://prometheus5.app.n8n.cloud/webhook';
export const N8N_INSTANCE_ID = '7edf9dbd0dc2afcd47af5b8da39c5d58dbe322ad798898e460ad228e7ae73b4a';

/** Bound on the live n8n instance — match exports/n8n-*.json credentials. */
export const N8N_CREDENTIALS = {
  googlePalmApi: {
    id: 'zvFDkn9Cp7SqbA1q',
    name: 'Google Gemini(PaLM) Api account',
  },
  googleSheetsOAuth2Api: {
    id: '9DvsM5k7IUgWQ5Bf',
    name: 'Google Sheets account',
  },
} as const;

export const N8N_GEMINI_MODELS = {
  contractSync: 'models/gemini-3.1-flash-lite',
  payloadContractCheck: 'models/gemini-3.1-flash-lite',
  leadNotesSummary: 'models/gemini-3.6-flash',
  prefillHealer: 'models/gemini-3-flash-preview',
} as const;

export const QUOTE_WEBHOOK_URL = `${N8N_BASE}/QuoteBuilder`;
/** Google Gemini n8n webhook — CRM notes → catalogue matches. */
export const PREFILL_HEALER_URL = `${N8N_BASE}/PrefillHealer`;
/** Google Gemini n8n webhook — quoteFinance vs Transform QuoteBuilder1. */
export const CONTRACT_SYNC_URL = `${N8N_BASE}/ContractSync`;
/** Google Gemini n8n webhook — lead notes → titled point summary. */
export const LEAD_NOTES_SUMMARY_URL = `${N8N_BASE}/LeadNotesSummary`;
/** Google Gemini n8n webhook — CostRatesFetch / LeadDataFetch payload contract. */
export const PAYLOAD_CONTRACT_CHECK_URL = `${N8N_BASE}/PayloadContractCheck`;
