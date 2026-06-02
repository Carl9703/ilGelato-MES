import { downloadPdfFromHtml } from './printDoc';

export interface PrintColumn {
  label: string;
  align?: 'left' | 'right' | 'center';
  bold?: boolean;
}

export interface PrintSection {
  heading?: string;
  columns: PrintColumn[];
  rows: (string | number | null)[][];
  totalRow?: (string | number | null)[];
}

export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  sections: PrintSection[];
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:11px;color:#000;background:#fff}
body{padding:0}
@page{size:A4 landscape;margin:14mm 14mm 12mm 14mm}
.doc-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}
.doc-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin-bottom:4px}
.doc-name{font-size:22px;font-weight:900;letter-spacing:-.5px;color:#000;line-height:1}
.doc-org{font-size:10px;color:#666;margin-top:3px}
.doc-ref{text-align:right}
.doc-ref-num{font-family:monospace;font-size:13px;font-weight:700;color:#555;margin-top:4px}
hr.thick{border:none;border-top:2.5px solid #000;margin:10px 0 14px}
.section{display:flex;align-items:center;gap:6px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#666;margin:16px 0 8px}
.section::after{content:'';flex:1;height:1px;background:#ccc}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:5px 7px;border-bottom:2px solid #000;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#444;white-space:nowrap}
td{padding:6px 7px;border-bottom:1px solid #e0e0e0;vertical-align:top;font-size:11px}
tbody tr:last-child td{border-bottom:none}
.r{text-align:right}.c{text-align:center}
.b{font-weight:700}.mono{font-family:monospace;font-size:11px}
.total-row td{font-weight:700;border-top:2px solid #000;background:#f0f0f0;font-size:11px}
.footer{margin-top:12px;padding-top:8px;font-size:9px;color:#94a3b8;border-top:1px solid #e0e0e0;text-align:right}
`;

function buildHtml(opts: PrintReportOptions): string {
  const now = new Date().toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const sectionsHtml = opts.sections.map(sec => {
    const heading = sec.heading
      ? `<div class="section">${sec.heading}</div>`
      : '';

    const thead = `<tr>${sec.columns.map(c => {
      const align = c.align === 'right' ? ' class="r"' : c.align === 'center' ? ' class="c"' : '';
      return `<th${align}>${c.label}</th>`;
    }).join('')}</tr>`;

    const tbody = sec.rows.map(row =>
      `<tr>${row.map((v, ci) => {
        const col = sec.columns[ci];
        const cls = [col?.align === 'right' ? 'r' : col?.align === 'center' ? 'c' : '', col?.bold ? 'b' : '', 'mono'].filter(Boolean).join(' ');
        const val = v == null ? '—' : String(v);
        return `<td class="${cls}">${val}</td>`;
      }).join('')}</tr>`
    ).join('');

    const tfoot = sec.totalRow
      ? `<tfoot><tr class="total-row">${sec.totalRow.map((v, ci) => {
          const col = sec.columns[ci];
          const cls = ['mono', col?.align === 'right' ? 'r' : col?.align === 'center' ? 'c' : ''].filter(Boolean).join(' ');
          const val = v == null ? '' : String(v);
          return `<td class="${cls}">${val}</td>`;
        }).join('')}</tr></tfoot>`
      : '';

    return `${heading}<table><thead>${thead}</thead><tbody>${tbody}</tbody>${tfoot}</table>`;
  }).join('');

  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>${opts.title}</title>
<style>${CSS}</style></head><body>

<div class="doc-top">
  <div>
    <div class="doc-type">Raport &mdash; ilGelato MES</div>
    <div class="doc-name">${opts.title}</div>
    <div class="doc-org">${opts.subtitle ?? 'ilGelato MES &middot; Magazyn główny'}</div>
  </div>
  <div class="doc-ref">
    <div class="doc-ref-num">Wygenerowano: ${now}</div>
  </div>
</div>

<hr class="thick">

${sectionsHtml}

<div class="footer">Wydrukowano z systemu ilGelato MES &middot; ${now}</div>

</body></html>`;
}

export async function printReport(opts: PrintReportOptions): Promise<void> {
  const html = buildHtml(opts);
  await downloadPdfFromHtml(html, opts.title || 'Raport');
}
