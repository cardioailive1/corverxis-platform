// Vercel Edge Function — Document persistence (save/load/list/delete)
// Uses Vercel KV. Falls back to in-memory (no persistence without KV).

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  });
  return true;
}

async function kvDel(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  await fetch(`${url}/del/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  return true;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const userId = req.headers.get('Authorization')?.replace('Bearer ', '') || 'anonymous';
  const docId  = url.searchParams.get('id');

  // GET /api/documents — list user's documents
  if (req.method === 'GET' && !docId) {
    const index = await kvGet(`docs:${userId}:index`) || [];
    return new Response(JSON.stringify({ documents: index }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // GET /api/documents?id=xxx — get one document
  if (req.method === 'GET' && docId) {
    const doc = await kvGet(`docs:${userId}:${docId}`);
    if (!doc) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(doc), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // POST /api/documents — save a document
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return new Response('Bad request', { status: 400, headers: CORS }); }
    const id = body.id || crypto.randomUUID();
    const doc = {
      id, userId,
      title: body.title || 'Untitled Document',
      docType: body.docType || '',
      product: body.product || '',
      jurisdiction: body.jurisdiction || '',
      content: body.content || '',
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await kvSet(`docs:${userId}:${id}`, doc);
    // Update index
    const index = await kvGet(`docs:${userId}:index`) || [];
    const existing = index.findIndex(d => d.id === id);
    const meta = { id, title: doc.title, docType: doc.docType, product: doc.product, updatedAt: doc.updatedAt };
    if (existing >= 0) index[existing] = meta; else index.unshift(meta);
    await kvSet(`docs:${userId}:index`, index.slice(0, 100)); // keep last 100
    return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // DELETE /api/documents?id=xxx
  if (req.method === 'DELETE' && docId) {
    await kvDel(`docs:${userId}:${docId}`);
    const index = (await kvGet(`docs:${userId}:index`) || []).filter(d => d.id !== docId);
    await kvSet(`docs:${userId}:index`, index);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response('Not found', { status: 404, headers: CORS });
}
