/**
 * Backend URLs for WEOTT proposal generation.
 * UI talks to n8n; n8n calls the proposal engine /generate endpoint.
 */
export const PROPOSAL_ENGINE_URL = 'https://weott-proposal-engine.onrender.com';
export const PROPOSAL_ENGINE_GENERATE_URL = `${PROPOSAL_ENGINE_URL}/generate`;

export const N8N_BASE = 'https://prometheus5.app.n8n.cloud/webhook';
export const QUOTE_WEBHOOK_URL = `${N8N_BASE}/QuoteBuilder`;
/** Google Gemini (Free Tier) n8n webhook — CRM notes → catalogue matches. */
export const PREFILL_HEALER_URL = `${N8N_BASE}/PrefillHealer`;
/** Google Gemini (Free Tier) n8n webhook — quoteFinance vs Transform QuoteBuilder1. */
export const CONTRACT_SYNC_URL = `${N8N_BASE}/ContractSync`;
