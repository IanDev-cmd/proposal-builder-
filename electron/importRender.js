const fs = require('fs');
const http = require('http');
const path = require('path');

function readRenderUrl(app) {
  const candidates = [];
  if (process.env.RENDER_DATABASE_URL) candidates.push(process.env.RENDER_DATABASE_URL);
  if (app && app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'render-database.url'));
  }
  candidates.push(path.join(__dirname, '..', 'scripts', 'render-database.url'));
  for (const item of candidates) {
    if (item && item.startsWith('postgresql://')) return item;
    if (item && fs.existsSync(item)) {
      const value = fs.readFileSync(item, 'utf8').trim();
      if (value) return value;
    }
  }
  return '';
}

function requestJson(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(body);
    const req = http.request(url, { method, headers: { ...headers, ...(payload ? { 'Content-Length': payload.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.setTimeout(60000, () => req.destroy(new Error('local engine timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function iso(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function quotePayload(row) {
  const extra = row.extra_json && typeof row.extra_json === 'object' ? row.extra_json : {};
  const payload = {
    ...extra,
    id: row.id,
    savedAt: iso(row.saved_at),
    leadKey: row.lead_key || '',
    leadName: row.lead_name || '',
    referenceNumber: row.reference_number || '',
    title: row.title || '',
    vesselType: row.vessel_type || '',
    eventType: row.event_type || '',
    guestCount: row.guest_count || '',
    eventDate: row.event_date || '',
    grandTotal: Number(row.grand_total || 0),
    step: Number(row.step || 0),
    data: row.data_json && typeof row.data_json === 'object' ? row.data_json : {},
    lead: row.lead_json || null,
    reviewStatus: row.review_status || 'pending',
  };
  if (row.proposal_id) payload.proposalId = row.proposal_id;
  if (row.reviewed_at) payload.reviewedAt = iso(row.reviewed_at);
  if (row.updated_at) payload.updatedAt = iso(row.updated_at);
  return payload;
}

function proposalPayload(row) {
  const extra = row.extra_json && typeof row.extra_json === 'object' ? row.extra_json : {};
  const payload = {
    ...extra,
    id: row.id,
    createdAt: iso(row.created_at),
    eventDate: row.event_date || '',
    title: row.title || '',
    filename: row.filename || '',
    vesselType: row.vessel_type || '',
    eventType: row.event_type || '',
    guestCount: row.guest_count || '',
    grandTotal: Number(row.grand_total || 0),
    leadName: row.lead_name || '',
    leadEmail: row.lead_email || '',
    leadCompany: row.lead_company || '',
    referenceNumber: row.reference_number || '',
    hasPdf: Boolean(row.pdf),
  };
  if (row.updated_at) payload.updatedAt = iso(row.updated_at);
  if (row.pdf) {
    const bytes = Buffer.isBuffer(row.pdf) ? row.pdf : Buffer.from(row.pdf);
    payload.pdfDataUrl = `data:application/pdf;base64,${bytes.toString('base64')}`;
  }
  return payload;
}

async function login(origin, pin) {
  const res = await requestJson(`${origin}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.json || !res.json.token) {
    throw new Error('Local engine login failed');
  }
  return res.json.token;
}

async function importRenderWorkspace({ origin, pin, app, onProgress }) {
  const report = (percent, label) => {
    if (typeof onProgress === 'function') onProgress(percent, label);
  };
  const url = readRenderUrl(app);
  if (!url) return { skipped: true, reason: 'no-render-url' };
  report(68, 'Downloading saved quotes');
  const listed = await requestJson(`${origin}/workspace/quotes`, {
    headers: { Authorization: `Bearer ${await login(origin, pin)}` },
  });
  const existing = listed.json && Array.isArray(listed.json.quotes) ? listed.json.quotes.length : 0;
  if (existing > 0) return { skipped: true, reason: 'local-already-has-quotes', existing };

  const { Client } = require('pg');
  const client = new Client({
    connectionString: url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, ''),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    query_timeout: 120000,
    connectionTimeoutMillis: 20000,
  });
  report(70, 'Downloading saved quotes');
  await client.connect();
  try {
    const token = await login(origin, pin);
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const quotes = await client.query(
      `SELECT id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
              vessel_type, event_type, guest_count, event_date, grand_total, step,
              review_status, proposal_id, lead_json, data_json, extra_json, updated_at
       FROM quotes WHERE deleted_at IS NULL ORDER BY saved_at DESC`,
    );
    let quoteCount = 0;
    const quoteTotal = quotes.rows.length;
    for (let index = 0; index < quotes.rows.length; index += 1) {
      const row = quotes.rows[index];
      const payload = quotePayload(row);
      const res = await requestJson(`${origin}/workspace/quotes/${encodeURIComponent(payload.id)}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify(payload),
      });
      if (res.status >= 200 && res.status < 300) quoteCount += 1;
      const span = quoteTotal > 0 ? (index + 1) / quoteTotal : 1;
      report(70 + Math.round(span * 14), 'Downloading saved quotes');
    }
    report(84, 'Saving proposals');
    const proposals = await client.query(
      `SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
              guest_count, grand_total, lead_name, lead_email, lead_company,
              reference_number, extra_json, updated_at
       FROM proposals WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    );
    let proposalCount = 0;
    const proposalTotal = proposals.rows.length;
    for (let index = 0; index < proposals.rows.length; index += 1) {
      const row = proposals.rows[index];
      try {
        const pdf = await client.query('SELECT pdf FROM proposals WHERE id = $1', [row.id]);
        row.pdf = pdf.rows[0] && pdf.rows[0].pdf;
      } catch {
        row.pdf = null;
      }
      const payload = proposalPayload(row);
      const res = await requestJson(`${origin}/workspace/proposals/${encodeURIComponent(payload.id)}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify(payload),
      });
      if (res.status >= 200 && res.status < 300) proposalCount += 1;
      const span = proposalTotal > 0 ? (index + 1) / proposalTotal : 1;
      report(Math.min(98, 84 + Math.round(span * 14)), 'Saving proposals');
    }
    return { skipped: false, quoteCount, proposalCount };
  } finally {
    await client.end();
  }
}

function stamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function quoteRow(quote) {
  const known = new Set([
    'id', 'savedAt', 'reviewedAt', 'leadKey', 'leadName', 'referenceNumber', 'title',
    'vesselType', 'eventType', 'guestCount', 'eventDate', 'grandTotal', 'step',
    'reviewStatus', 'proposalId', 'lead', 'data', 'updatedAt', 'syncRevision', 'syncUpdatedAt',
  ]);
  const extra = {};
  for (const [key, value] of Object.entries(quote || {})) {
    if (!known.has(key)) extra[key] = value;
  }
  return {
    id: quote.id,
    savedAt: quote.savedAt || quote.updatedAt || new Date().toISOString(),
    reviewedAt: quote.reviewedAt || null,
    leadKey: quote.leadKey || '',
    leadName: quote.leadName || '',
    referenceNumber: quote.referenceNumber || '',
    title: quote.title || '',
    vesselType: quote.vesselType || '',
    eventType: quote.eventType || '',
    guestCount: quote.guestCount || '',
    eventDate: quote.eventDate || '',
    grandTotal: Number(quote.grandTotal || 0),
    step: Number(quote.step || 0),
    reviewStatus: quote.reviewStatus || 'pending',
    proposalId: quote.proposalId || null,
    lead: quote.lead || null,
    data: quote.data && typeof quote.data === 'object' ? quote.data : {},
    extra,
    updatedAt: quote.updatedAt || quote.savedAt || new Date().toISOString(),
  };
}

function pdfBuffer(dataUrl) {
  const text = String(dataUrl || '');
  const marker = 'base64,';
  const at = text.indexOf(marker);
  if (at === -1) return null;
  return Buffer.from(text.slice(at + marker.length), 'base64');
}

async function openRender(app) {
  const url = readRenderUrl(app);
  if (!url) return null;
  const { Client } = require('pg');
  const client = new Client({
    connectionString: url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, ''),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120000,
    query_timeout: 120000,
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  return client;
}

async function upsertRemoteQuote(client, quote) {
  const row = quoteRow(quote);
  await client.query(
    `INSERT INTO quotes (
       id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
       vessel_type, event_type, guest_count, event_date, grand_total, step,
       review_status, proposal_id, lead_json, data_json, extra_json, updated_at, deleted_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19,NULL
     )
     ON CONFLICT (id) DO UPDATE SET
       saved_at = EXCLUDED.saved_at,
       reviewed_at = EXCLUDED.reviewed_at,
       lead_key = EXCLUDED.lead_key,
       lead_name = EXCLUDED.lead_name,
       reference_number = EXCLUDED.reference_number,
       title = EXCLUDED.title,
       vessel_type = EXCLUDED.vessel_type,
       event_type = EXCLUDED.event_type,
       guest_count = EXCLUDED.guest_count,
       event_date = EXCLUDED.event_date,
       grand_total = EXCLUDED.grand_total,
       step = EXCLUDED.step,
       review_status = EXCLUDED.review_status,
       proposal_id = EXCLUDED.proposal_id,
       lead_json = EXCLUDED.lead_json,
       data_json = EXCLUDED.data_json,
       extra_json = EXCLUDED.extra_json,
       updated_at = EXCLUDED.updated_at,
       deleted_at = NULL
     WHERE quotes.updated_at IS NULL OR quotes.updated_at <= EXCLUDED.updated_at`,
    [
      row.id, row.savedAt, row.reviewedAt, row.leadKey, row.leadName, row.referenceNumber, row.title,
      row.vesselType, row.eventType, row.guestCount, row.eventDate, row.grandTotal, row.step,
      row.reviewStatus, row.proposalId, JSON.stringify(row.lead), JSON.stringify(row.data),
      JSON.stringify(row.extra), row.updatedAt,
    ],
  );
}

async function upsertRemoteProposal(client, proposal) {
  const pdf = pdfBuffer(proposal.pdfDataUrl);
  await client.query(
    `INSERT INTO proposals (
       id, created_at, event_date, title, filename, vessel_type, event_type,
       guest_count, grand_total, lead_name, lead_email, lead_company,
       reference_number, extra_json, updated_at, pdf, deleted_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,NULL
     )
     ON CONFLICT (id) DO UPDATE SET
       created_at = EXCLUDED.created_at,
       event_date = EXCLUDED.event_date,
       title = EXCLUDED.title,
       filename = EXCLUDED.filename,
       vessel_type = EXCLUDED.vessel_type,
       event_type = EXCLUDED.event_type,
       guest_count = EXCLUDED.guest_count,
       grand_total = EXCLUDED.grand_total,
       lead_name = EXCLUDED.lead_name,
       lead_email = EXCLUDED.lead_email,
       lead_company = EXCLUDED.lead_company,
       reference_number = EXCLUDED.reference_number,
       extra_json = EXCLUDED.extra_json,
       updated_at = EXCLUDED.updated_at,
       pdf = COALESCE(EXCLUDED.pdf, proposals.pdf),
       deleted_at = NULL
     WHERE proposals.updated_at IS NULL OR proposals.updated_at <= EXCLUDED.updated_at`,
    [
      proposal.id,
      proposal.createdAt || proposal.updatedAt || new Date().toISOString(),
      proposal.eventDate || '',
      proposal.title || '',
      proposal.filename || '',
      proposal.vesselType || '',
      proposal.eventType || '',
      proposal.guestCount || '',
      Number(proposal.grandTotal || 0),
      proposal.leadName || '',
      proposal.leadEmail || '',
      proposal.leadCompany || '',
      proposal.referenceNumber || '',
      JSON.stringify({}),
      proposal.updatedAt || proposal.createdAt || new Date().toISOString(),
      pdf,
    ],
  );
}

/**
 * Keep this computer's SQLite copy and the Render database aligned.
 * Local rows stay on the PC. Newer rows move in either direction.
 * The same exchange used to run only once, during installation.
 */
async function syncRenderWorkspace({ origin, pin, app }) {
  const client = await openRender(app);
  if (!client) return { skipped: true, reason: 'no-render-url' };
  const token = await login(origin, pin);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const counts = { pulledQuotes: 0, pushedQuotes: 0, pulledProposals: 0, pushedProposals: 0 };
  try {
    const localQuotesRes = await requestJson(`${origin}/workspace/quotes`, { headers: auth });
    const localQuotes = localQuotesRes.json && Array.isArray(localQuotesRes.json.quotes) ? localQuotesRes.json.quotes : [];
    const localQuoteById = new Map(localQuotes.map((row) => [row.id, row]));
    const remoteQuotes = await client.query(
      `SELECT id, updated_at FROM quotes WHERE deleted_at IS NULL`,
    );
    const remoteQuoteById = new Map(remoteQuotes.rows.map((row) => [row.id, row]));

    for (const remote of remoteQuotes.rows) {
      const local = localQuoteById.get(remote.id);
      if (local && stamp(local.updatedAt || local.savedAt) >= stamp(remote.updated_at)) continue;
      const full = await client.query(
        `SELECT id, saved_at, reviewed_at, lead_key, lead_name, reference_number, title,
                vessel_type, event_type, guest_count, event_date, grand_total, step,
                review_status, proposal_id, lead_json, data_json, extra_json, updated_at
         FROM quotes WHERE id = $1`,
        [remote.id],
      );
      if (!full.rows[0]) continue;
      const res = await requestJson(`${origin}/workspace/quotes/${encodeURIComponent(remote.id)}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify(quotePayload(full.rows[0])),
      });
      if (res.status >= 200 && res.status < 300) counts.pulledQuotes += 1;
    }

    for (const local of localQuotes) {
      const remote = remoteQuoteById.get(local.id);
      if (remote && stamp(remote.updated_at) >= stamp(local.updatedAt || local.savedAt)) continue;
      const full = await requestJson(`${origin}/workspace/quotes/${encodeURIComponent(local.id)}`, { headers: auth });
      if (!full.json || !full.json.id) continue;
      await upsertRemoteQuote(client, full.json.quote && full.json.quote.id ? full.json.quote : full.json);
      counts.pushedQuotes += 1;
    }

    const localProposalsRes = await requestJson(`${origin}/workspace/proposals`, { headers: auth });
    const localProposals = localProposalsRes.json && Array.isArray(localProposalsRes.json.proposals)
      ? localProposalsRes.json.proposals
      : [];
    const localProposalById = new Map(localProposals.map((row) => [row.id, row]));
    const remoteProposals = await client.query(
      `SELECT id, updated_at, created_at FROM proposals WHERE deleted_at IS NULL`,
    );
    const remoteProposalById = new Map(remoteProposals.rows.map((row) => [row.id, row]));

    for (const remote of remoteProposals.rows) {
      const local = localProposalById.get(remote.id);
      const remoteStamp = stamp(remote.updated_at || remote.created_at);
      if (local && stamp(local.updatedAt || local.createdAt) >= remoteStamp) continue;
      const full = await client.query(
        `SELECT id, created_at, event_date, title, filename, vessel_type, event_type,
                guest_count, grand_total, lead_name, lead_email, lead_company,
                reference_number, extra_json, updated_at, pdf
         FROM proposals WHERE id = $1`,
        [remote.id],
      );
      if (!full.rows[0]) continue;
      const res = await requestJson(`${origin}/workspace/proposals/${encodeURIComponent(remote.id)}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify(proposalPayload(full.rows[0])),
      });
      if (res.status >= 200 && res.status < 300) counts.pulledProposals += 1;
    }

    for (const local of localProposals) {
      const remote = remoteProposalById.get(local.id);
      const remoteStamp = remote ? stamp(remote.updated_at || remote.created_at) : 0;
      if (remote && remoteStamp >= stamp(local.updatedAt || local.createdAt)) continue;
      const full = await requestJson(`${origin}/workspace/proposals/${encodeURIComponent(local.id)}`, { headers: auth });
      const body = full.json && full.json.proposal && full.json.proposal.id ? full.json.proposal : full.json;
      if (!body || !body.id) continue;
      await upsertRemoteProposal(client, body);
      counts.pushedProposals += 1;
    }
    return counts;
  } finally {
    await client.end();
  }
}

function localChangeSignature(quotes, proposals) {
  const quotePart = (quotes || []).map((row) => `${row.id}:${row.updatedAt || row.savedAt || ''}`).sort().join('|');
  const proposalPart = (proposals || []).map((row) => `${row.id}:${row.updatedAt || row.createdAt || ''}`).sort().join('|');
  return `${quotePart}#${proposalPart}`;
}

module.exports = {
  importRenderWorkspace,
  syncRenderWorkspace,
  localChangeSignature,
  readRenderUrl,
  login,
  requestJson,
};
