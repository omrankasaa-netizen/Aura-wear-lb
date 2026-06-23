// Client helpers for CSV export, print, and WhatsApp click-to-chat. CSV text is
// built server-side (money columns gated by role there); this just triggers the
// download. Print opens an audit-ready window reflecting the on-screen rows.

// Default international dialing code for WhatsApp links. Change this one line to
// switch the store's default country (Lebanon = 961).
export const DEFAULT_COUNTRY_CODE = '961';

const STORE_NAME = 'AURA WEAR';

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open an export, by invoking a server CSV function then downloading the result.
export async function exportViaFunction(base44, fnName, body) {
  const res = await base44.functions.invoke(fnName, body || {});
  const data = res?.data || res;
  if (data?.csv) downloadCsv(data.filename, data.csv);
  return data;
}

// Print a simple, audit-ready table window: store header + date + table.
export function printTable(title, headers, rows) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const thead = `<tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const tbody = rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px;letter-spacing:2px}
      .meta{font-size:12px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f4f1ea}
      @media print{button{display:none}}
    </style></head><body>
    <h1>${STORE_NAME}</h1>
    <div class="meta">${esc(title)} · ${new Date().toLocaleString()} · ${rows.length} rows</div>
    <button onclick="window.print()" style="margin-bottom:12px;padding:6px 12px">Print</button>
    <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`);
  w.document.close();
}

// Build a wa.me click-to-chat link. Strips non-digits, prepends the default
// country code when the number has no leading + / code. No API, no bulk sends.
export function whatsappLink(phone, message) {
  let digits = String(phone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    digits = DEFAULT_COUNTRY_CODE + digits.replace(/^0+/, '');
  }
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

export function whatsappGreeting(name) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return `Hello ${first}, this is ${STORE_NAME}. `;
}
