// Vercel Edge Function — Waitlist signup
// Saves email to Vercel KV store (set KV_REST_API_URL + KV_REST_API_TOKEN env vars)
// Falls back gracefully if KV not configured

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body;
  try { body = await req.json(); } catch { return new Response('Bad request', { status: 400, headers: CORS }); }

  const { email, name, org, type, stage } = body;
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const entry = { email, name: name||'', org: org||'', type: type||'', stage: stage||'', ts: new Date().toISOString(), id: crypto.randomUUID() };

  // Try to save to Vercel KV
  try {
    const KV_URL   = process.env.KV_REST_API_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN;
    if (KV_URL && KV_TOKEN) {
      // Store as list entry
      await fetch(`${KV_URL}/lpush/ngl_waitlist`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(JSON.stringify(entry)),
      });
    }
  } catch(e) {
    // KV not configured — still return success
    console.error('KV save failed:', e.message);
  }

  // Send notification email via Resend (optional)
  try {
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'NexGenLife <noreply@corverxis.ai>',
          to: ['hello@corverxis.ai'],
          subject: `New NexGenLife waitlist signup: ${email}`,
          text: `Name: ${name||'—'}\nEmail: ${email}\nOrg: ${org||'—'}\nType: ${type||'—'}\nStage: ${stage||'—'}\nTime: ${entry.ts}`,
        }),
      });
    }
  } catch(e) { console.error('Email notify failed:', e.message); }

  return new Response(JSON.stringify({ success: true, id: entry.id, message: 'You\'re on the waitlist!' }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
