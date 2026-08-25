/**
 * Backend URLs for WEOTT proposal generation.
 * UI talks to n8n; n8n calls the proposal engine /generate endpoint.
 *
 * Live n8n: harmony9.app.n8n.cloud (WEOTT workflow)
 */
export const PROPOSAL_ENGINE_URL = 'https://weott-proposal-engine.onrender.com';
export const PROPOSAL_ENGINE_GENERATE_URL = `${PROPOSAL_ENGINE_URL}/generate`;

export const N8N_BASE = 'https://harmony9.app.n8n.cloud/webhook';
export const N8N_INSTANCE_HOST = 'https://harmony9.app.n8n.cloud';
export const N8N_INSTANCE_ID = '0b033e4dea3e06f7022fa976138770d89a94a569a45a7883de93bf9335d36920';

/** Bound on harmony9 — match the live WEOTT canvas (exports/n8n-weott-all-in-one.json). */
export const N8N_CREDENTIALS = {
  googlePalmApi: {
    id: 'dlay23hFXEWTtpXH',
    name: 'Google Gemini(PaLM) Api account',
  },
  googleSheetsOAuth2Api: {
    id: 'GZhF0w9mcVHkFaHo',
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
