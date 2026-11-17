// O relatório em HTML para virar PDF, com o desenho da página de imprimir do site (app/imprimir).
import { formatQty } from "./dates.ts";
import { fitBlankSheet, PRINT } from "./site/print-fit.ts";
import { orientationOf, type Cell, type Column, type Report } from "./site/xlsx.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function show(value: Cell, column: Column): string {
  if (value === null) return "";
  if (typeof value === "string") return value;
  return column.kind === "money" ? brl.format(value) : formatQty(value);
}

const MARK =
  '<svg viewBox="0 0 19 24" width="15" height="19"><path d="M1.5 12H13a6 6 0 0 1 0 12H1.5A1.5 1.5 0 0 1 0 22.5v-9A1.5 1.5 0 0 1 1.5 12Z" fill="#f6a000"/><path d="M1.5 0h7a5 5 0 0 1 0 10h-7A1.5 1.5 0 0 1 0 8.5v-7A1.5 1.5 0 0 1 1.5 0Z" fill="#141414"/></svg>';

/**
 * O relatório em HTML para o PDF, com o mesmo desenho da página de imprimir do site: título, loja e data,
 * a tabela com o tipo como título de cada grupo, linhas altas na planilha em branco e o total no fim.
 */
export function reportHtml(report: Report, blank: boolean, pageMargin = "10mm"): string {
  const right = (c: Column) => c.kind === "number" || c.kind === "money" || c.align === "right";
  const grouped = report.separateBy !== undefined;
  const shown = report.columns.map((_, i) => i).filter((i) => i !== report.separateBy);
  const groups: [string, Cell[][]][] = [];
  for (const row of report.rows) {
    const key = grouped ? String(row[report.separateBy!] ?? "") : "";
    const last = groups.at(-1);
    if (last && last[0] === key) last[1].push(row);
    else groups.push([key, [row]]);
  }
  // Planilha em branco: folhas certas, com as mesmas medidas da página de imprimir do site.
  const fit = blank ? fitBlankSheet(report.rows.length, grouped ? groups.length : 0) : null;
  const head = shown
    .map((i) => {
      const c = report.columns[i];
      return `<th class="${right(c) ? "r" : ""}${blank && right(c) && !c.align ? " w" : ""}">${esc(c.label)}</th>`;
    })
    .join("");
  const body = groups
    .map(([group, rows]) => {
      const title = grouped ? `<tr class="g"><th colspan="${shown.length}">${esc(group)}</th></tr>` : "";
      const lines = rows
        .map(
          (row, r) =>
            `<tr class="${blank && r % 2 === 1 ? "z" : ""}">${shown
              .map((i) => {
                const v = row[i];
                const col = report.columns[i];
                const cls = col.align === "right" ? "r b" : right(col) && typeof v === "number" ? "r n" : "";
                return `<td class="${cls}${blank ? " t" : ""}">${esc(show(v, col))}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("");
      return title + lines;
    })
    .join("");
  const total = report.total
    ? `<tfoot><tr>${shown
        .map((i, n) => {
          const v = n === 0 && grouped ? report.total![report.separateBy!] : report.total![i];
          return `<td class="${typeof v === "number" ? "r n" : ""}">${esc(show(v, report.columns[i]))}</td>`;
        })
        .join("")}</tr></tfoot>`
    : "";
  const now = new Date(Date.now() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const when = `${p(now.getUTCDate())}/${p(now.getUTCMonth() + 1)}/${String(now.getUTCFullYear()).slice(2)} ${p(now.getUTCHours())}:${p(now.getUTCMinutes())}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 ${orientationOf(report)}; margin: ${pageMargin}; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #141414; margin: 0; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #141414; padding-bottom: 8px; margin-bottom: 12px; }
    h1 { font-size: 20px; margin: 0; font-weight: 800; }
    .sub { font-size: 11px; color: #5f5b53; margin-top: 4px; }
    .logo { display: flex; align-items: center; gap: 5px; font-size: 16px; }
    .logo b { font-weight: 800; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #e8e3d9; padding: 5px 7px; text-align: left; vertical-align: top; }
    thead th { background: #f2f2f2; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; }
    tr.g th { border: none; padding: 12px 2px 5px; font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; }
    tr { page-break-inside: avoid; }
    .r { text-align: right; } .b { font-weight: 600; } .n { font-variant-numeric: tabular-nums; }
    .w { width: 15%; } .t { height: 22px; } tr.z td { background: #f4f2ed; }${
      fit
        ? `
    header { height: ${PRINT.header - 4}mm; margin-bottom: 4mm; overflow: hidden; box-sizing: border-box; }
    thead tr { height: ${PRINT.thead}mm; }
    tr.g { height: ${PRINT.group}mm; } tr.g th { padding: 3mm 2px 1mm; }
    td.t { height: ${fit.rowMm}mm; padding-top: 0; padding-bottom: 0; vertical-align: middle; box-sizing: border-box; }
    .foot { height: ${PRINT.footer}mm; margin: 0; padding-top: 3mm; box-sizing: border-box; }`
        : ""
    }
    /* Planilha em branco: larguras fixas, para as quatro semanas caberem na folha em pé. */
    table.fixed { table-layout: fixed; } table.fixed thead th { font-size: 8pt; letter-spacing: 0; word-break: break-word; }
    tfoot td { font-weight: 800; background: #f2f2f2; }
    .foot { font-size: 9px; color: #5f5b53; margin-top: 14px; }
  </style></head><body>
    <header><div><h1>${esc(report.title)}</h1><div class="sub">${esc(report.subtitle)}</div></div>
    <div class="logo">${MARK}<span>Best<b>Stock</b></span></div></header>
    ${report.rows.length === 0 ? '<p class="sub">Nada para mostrar neste relatório.</p>' : `<table${blank ? ' class="fixed"' : ""}><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${total}</table>`}
    <p class="foot">Gerado pelo BestStock em ${when}.</p>
  </body></html>`;
}
