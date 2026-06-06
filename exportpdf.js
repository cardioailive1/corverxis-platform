// Vercel Edge Function — Document Export (HTML response styled for printing)
// Returns a print-ready HTML page that auto-triggers print dialog
// For real PDF generation, set PDFSHIFT_KEY env var to use PDFShift API

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

  const { markdown, title, product, jurisdiction, docType } = body;
  if (!markdown) return new Response(JSON.stringify({ error: 'markdown content required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

  // Try PDFShift if key available
  const PDFSHIFT_KEY = process.env.PDFSHIFT_KEY;
  if (PDFSHIFT_KEY) {
    try {
      const printHtml = buildPrintHTML(markdown, title, product, jurisdiction, docType);
      const resp = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa('api:' + PDFSHIFT_KEY)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: printHtml, landscape: false, use_print: true }),
      });
      if (resp.ok) {
        const pdfBytes = await resp.arrayBuffer();
        return new Response(pdfBytes, {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${(title||'document').replace(/\s+/g,'-').toLowerCase()}.pdf"` },
        });
      }
    } catch(e) { console.error('PDFShift failed:', e.message); }
  }

  // Fallback: return print-ready HTML (browser handles PDF via Ctrl+P)
  const printHtml = buildPrintHTML(markdown, title, product, jurisdiction, docType);
  return new Response(printHtml, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'text/html', 'Content-Disposition': `attachment; filename="${(title||'document').replace(/\s+/g,'-').toLowerCase()}.html"` },
  });
}

function buildPrintHTML(markdown, title, product, jurisdiction, docType) {
  const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${title||'Regulatory Document'}</title>
<style>
  @page{size:A4;margin:25mm 20mm}
  *{box-sizing:border-box}
  body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.8;color:#111;max-width:170mm;margin:0 auto}
  .doc-header{border-bottom:2pt solid #00C8FF;padding-bottom:12pt;margin-bottom:20pt}
  .doc-logo{font-family:Arial,sans-serif;font-size:9pt;color:#00C8FF;letter-spacing:2px;text-transform:uppercase;margin-bottom:6pt}
  .doc-title{font-size:18pt;font-weight:700;color:#0A1628;margin:6pt 0 4pt;line-height:1.3}
  .doc-meta{font-family:Arial,sans-serif;font-size:8.5pt;color:#555;display:flex;gap:20pt;flex-wrap:wrap;margin-top:8pt}
  .doc-meta span{display:flex;flex-direction:column;gap:2pt}
  .doc-meta label{font-size:7pt;color:#00C8FF;text-transform:uppercase;letter-spacing:1px}
  h1{font-size:16pt;color:#0A1628;border-bottom:1pt solid #00C8FF;padding-bottom:5pt;margin:20pt 0 8pt;page-break-after:avoid}
  h2{font-size:13pt;color:#0A1628;margin:16pt 0 6pt;page-break-after:avoid}
  h3{font-family:Arial,sans-serif;font-size:8.5pt;color:#00C8FF;text-transform:uppercase;letter-spacing:1.5px;margin:14pt 0 5pt;page-break-after:avoid}
  p{margin:0 0 9pt}
  ul,ol{padding-left:18pt;margin:6pt 0 10pt}
  li{margin-bottom:4pt}
  table{width:100%;border-collapse:collapse;margin:10pt 0;font-size:10pt;page-break-inside:avoid}
  th{background:#f0f8ff;border:0.5pt solid #ccc;padding:6pt 8pt;text-align:left;font-family:Arial,sans-serif;font-size:8pt;color:#0A1628}
  td{border:0.5pt solid #ddd;padding:6pt 8pt;vertical-align:top}
  blockquote{border-left:3pt solid #00C8FF;padding:8pt 12pt;background:#f8fbff;margin:10pt 0;font-style:italic;color:#333}
  code{background:#f4f4f4;padding:1pt 4pt;border-radius:2pt;font-family:'Courier New',monospace;font-size:9.5pt}
  pre{background:#f4f4f4;padding:10pt;border-radius:3pt;font-family:'Courier New',monospace;font-size:9pt;overflow:auto;margin:10pt 0}
  .footer{position:fixed;bottom:0;left:0;right:0;font-family:Arial,sans-serif;font-size:7.5pt;color:#999;text-align:center;padding:6pt;border-top:0.5pt solid #eee;background:#fff}
  strong{color:#0A1628}
  @media print{.footer{position:fixed}}
</style></head><body>
<div class="doc-header">
  <div class="doc-logo">Corverxis Technologies · NexGenLife</div>
  <div class="doc-title">${title||docType||'Regulatory Document'}</div>
  <div class="doc-meta">
    ${product ? `<span><label>Product</label>${product}</span>` : ''}
    ${jurisdiction ? `<span><label>Jurisdiction</label>${jurisdiction}</span>` : ''}
    <span><label>Generated</label>${date}</span>
    <span><label>Model</label>NexGen Ultra</span>
    <span><label>Status</label>AI DRAFT — REVIEW REQUIRED</span>
  </div>
</div>
<div class="doc-body">${mdToHtml(markdown)}</div>
<div class="footer">NexGenLife · Corverxis Technologies · AI-generated draft — requires professional review before regulatory submission · Generated ${date}</div>
</body></html>`;
}

function mdToHtml(md) {
  if (!md) return '';
  return md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g,'<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g,'<em>$1</em>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g,'<ul>$1</ul>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/^(?!<[hup]|<bl|<pr)/gm,'');
}
