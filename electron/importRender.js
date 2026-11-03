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

module.exports = { importRenderWorkspace, readRenderUrl };
