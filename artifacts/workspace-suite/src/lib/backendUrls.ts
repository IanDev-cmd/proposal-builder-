/**
 * Backend URLs for WEOTT proposal generation.
 * UI talks to n8n; n8n calls the proposal engine /generate endpoint.
 */
export const PROPOSAL_ENGINE_URL = 'https://stargtm-kkzz.onrender.com';
export const PROPOSAL_ENGINE_GENERATE_URL = `${PROPOSAL_ENGINE_URL}/generate`;

export const N8N_BASE = 'https://meeraworkflows.app.n8n.cloud/webhook';
export const QUOTE_WEBHOOK_URL = `${N8N_BASE}/QuoteBuilder`;
