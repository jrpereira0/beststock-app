// Copiado de beststock/src/lib/xlsx.ts por scripts/copiar-do-site.mjs. Não edite aqui.
/**
 * Planilha do Excel (.xlsx) feita aqui mesmo, sem biblioteca: um arquivo zip com alguns XML dentro.
 * Segue o padrão da planilha da loja: TIPO e ITEM nas primeiras colunas, cabeçalho em negrito na
 * primeira linha, que fica parada ao rolar, e bordas finas em volta das células.
 */

export type Cell = string | number | null;
export type Column = {
  label: string;
  kind?: "text" | "number" | "money";
  /** Texto alinhado à direita. Números e valores já ficam à direita. */
  align?: "right";
};
export type Report = {
  title: string;
  /** Loja, data e de onde vêm os números. */
  subtitle: string;
  /** Nome do arquivo, sem extensão. */
  filename: string;
  /** Nome da aba da planilha. */
  sheet: string;
  columns: Column[];
  rows: Cell[][];
  /** Linha de total no fim, quando faz sentido. */
  total?: Cell[];
  /** Coluna que separa os grupos: uma linha em branco entre um tipo e outro. */
  separateBy?: number;
  /** Folha na impressão. Sem isso, deitada quando a tabela tem mais de 5 colunas. */
  orientation?: "portrait" | "landscape";
  /** Planilha para escrever à mão: linhas altas e folhas certas, sem uma última folha quase vazia. */
  handwritten?: boolean;
};

/** Folha em pé ou deitada para imprimir o relatório. */
export function orientationOf(report: Report): "portrait" | "landscape" {
  return report.orientation ?? (report.columns.length > 5 ? "landscape" : "portrait");
}

// ---------- zip sem compressão ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: { name: string; data: string }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.data);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---------- a planilha ----------

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de controle não são aceitos no XML.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** A, B, …, Z, AA, AB… */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// Estilos (índice em cellXfs):
// 0 padrão · 1 cabeçalho (escuro) · 2 texto · 3 número · 4 dinheiro · 5 total em texto · 6 total em dinheiro
// 7 total em número · 8 texto à direita · 9 cabeçalho à direita · 10 título · 11 subtítulo · 12 faixa do tipo
// 13 a 16: texto, número, dinheiro e texto à direita nas linhas alternadas (fundo creme).
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.###"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF141414"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5F5B53"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF141414"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE3A8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F5F0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9D4C9"/></left><right style="thin"><color rgb="FFD9D4C9"/></right><top style="thin"><color rgb="FFD9D4C9"/></top><bottom style="thin"><color rgb="FFD9D4C9"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="17">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref: string, value: Cell, column: Column, total: boolean, zebra = false): string {
  const numeric = column.kind === "number" || column.kind === "money";
  if (typeof value === "number" && Number.isFinite(value)) {
    const style = total ? (column.kind === "money" ? 6 : 7) : column.kind === "money" ? (zebra ? 15 : 4) : zebra ? 14 : 3;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  const style = total ? 5 : numeric ? (zebra ? 14 : 3) : column.align === "right" ? (zebra ? 16 : 8) : zebra ? 13 : 2;
  if (value === null || value === "") return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(String(value))}</t></is></c>`;
}

/** Nome de aba aceito pelo Excel: até 31 caracteres, sem : \ / ? * [ ]. */
function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Planilha";
}

/** Linhas do relatório com uma linha em branco (null) entre um grupo e outro. */
export function withSeparators(report: Report): (Cell[] | null)[] {
  if (report.separateBy === undefined) return report.rows;
  const out: (Cell[] | null)[] = [];
  report.rows.forEach((row, i) => {
    if (i > 0 && row[report.separateBy!] !== report.rows[i - 1][report.separateBy!]) out.push(null);
    out.push(row);
  });
  return out;
}

/** Os grupos do relatório, na ordem: o tipo e as linhas dele. Sem separação, um grupo só, sem nome. */
function groupsOf(report: Report): [string, Cell[][]][] {
  const out: [string, Cell[][]][] = [];
  for (const row of report.rows) {
    const key = report.separateBy === undefined ? "" : String(row[report.separateBy] ?? "");
    const last = out.at(-1);
    if (last && last[0] === key) last[1].push(row);
    else out.push([key, [row]]);
  }
  return out;
}

// Alturas fixas, em pontos: título, subtítulo, espaço, cabeçalho e a faixa de cada tipo.
const TITLE_PT = 26;
const SUBTITLE_PT = 16;
const GAP_PT = 8;
const HEADER_PT = 22;
const GROUP_PT = 20;
/** Linha do cabeçalho da tabela: título, subtítulo e um espaço vêm antes. */
const HEADER_ROW = 4;

/**
 * Folhas certas no Excel: com a largura das colunas (em caracteres da fonte padrão) o Excel encolhe a
 * planilha para caber na largura da folha A4; com essa escala, escolhe o menor número de folhas e a
 * altura das linhas para encher as folhas por igual (a mesma ideia de lib/print-fit.ts para o PDF).
 */
function fitXlsxPages(report: Report, widths: number[], groups: number) {
  const pt = (mm: number) => Math.round(((mm * 72) / 25.4) * 10) / 10;
  // Largura da coluna em pontos: o Excel usa 7 px por caractere mais 5 px de folga, a 96 px por polegada.
  const tablePt = widths.reduce((sum, w) => sum + Math.trunc(w * 7 + 5), 0) * 0.75;
  const printWidth = (8.27 - 0.8) * 72;
  const printHeight = (11.69 - 1.0) * 72;
  const scale = Math.min(1, printWidth / tablePt);
  const rows = report.rows.length;
  // Mínima e máxima da linha já impressa: com a planilha encolhida, a linha no arquivo precisa ser mais alta.
  const minRow = pt(6.5) / scale;
  const maxRow = pt(11) / scale;
  // Altura útil por folha, sem escala: o cabeçalho se repete, e uma linha e uma faixa de tipo de folga.
  const perPage = (row: number) => printHeight / scale - HEADER_PT - row - GROUP_PT;
  const fixed = TITLE_PT + SUBTITLE_PT + GAP_PT + groups * GROUP_PT;
  let pages = 1;
  while (pages * perPage(minRow) < fixed + rows * minRow) pages++;
  const rowPt = Math.min(maxRow, Math.floor(((pages * perPage(maxRow) - fixed) / rows) * 10) / 10);
  return { pages, rowPt: Math.max(minRow, rowPt) };
}

/**
 * A planilha organizada como a folha impressa: título e loja no alto, cabeçalho escuro que fica parado ao
 * rolar e se repete em cada folha impressa, uma faixa com o nome de cada tipo (AÇAÍ, SORVETES…) no lugar da
 * coluna de tipo repetida, linhas alternadas e o total no fim.
 */
export function toXlsx(report: Report): Uint8Array<ArrayBuffer> {
  // O tipo vira a faixa de cada grupo: sai das colunas.
  const shown = report.columns.map((_, i) => i).filter((i) => i !== report.separateBy);
  const cols = shown.map((i) => report.columns[i]);
  const groups = groupsOf(report);
  const grouped = report.separateBy !== undefined;
  const right = (c: Column) => c.kind === "number" || c.kind === "money" || c.align === "right";
  const widths = shown.map((i) => {
    const c = report.columns[i];
    let longest = c.label.length;
    for (const row of report.rows) {
      const v = row[i];
      const text = typeof v === "number" ? (c.kind === "money" ? v.toFixed(2) + "R$ " : String(v)) : (v ?? "");
      longest = Math.max(longest, text.length);
    }
    return Math.min(48, Math.max(10, longest + 3));
  });

  // Planilha para escrever à mão: altura das linhas e número de folhas (A4 em pé) para as folhas saírem cheias.
  const fit = report.handwritten ? fitXlsxPages(report, widths, grouped ? groups.length : 0) : null;
  const ht = (pt: number | undefined) => (pt ? ` ht="${pt}" customHeight="1"` : "");
  const last = columnName(cols.length - 1);
  const merges: string[] = [];
  const rowsXml: string[] = [];
  const text = (ref: string, style: number, value: string) =>
    `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;

  rowsXml.push(`<row r="1"${ht(TITLE_PT)}>${text("A1", 10, report.title)}</row>`);
  rowsXml.push(`<row r="2"${ht(SUBTITLE_PT)}>${text("A2", 11, report.subtitle)}</row>`);
  rowsXml.push(`<row r="3"${ht(GAP_PT)}/>`);
  rowsXml.push(
    `<row r="${HEADER_ROW}"${ht(HEADER_PT)}>${cols.map((c, i) => text(`${columnName(i)}${HEADER_ROW}`, right(c) ? 9 : 1, c.label)).join("")}</row>`,
  );
  let r = HEADER_ROW;
  for (const [group, rows] of groups) {
    if (grouped) {
      r++;
      // A faixa do tipo ocupa a largura da tabela (células juntas).
      rowsXml.push(
        `<row r="${r}"${ht(GROUP_PT)}>${cols.map((_, i) => (i === 0 ? text(`A${r}`, 12, group) : `<c r="${columnName(i)}${r}" s="12"/>`)).join("")}</row>`,
      );
      if (cols.length > 1) merges.push(`A${r}:${last}${r}`);
    }
    rows.forEach((row, n) => {
      r++;
      rowsXml.push(
        `<row r="${r}"${ht(fit?.rowPt)}>${shown.map((i, k) => cellXml(`${columnName(k)}${r}`, row[i], report.columns[i], false, n % 2 === 1)).join("")}</row>`,
      );
    });
  }
  if (report.total) {
    r++;
    rowsXml.push(
      `<row r="${r}">${shown
        .map((i, k) => cellXml(`${columnName(k)}${r}`, k === 0 && grouped ? report.total![report.separateBy!] : report.total![i], report.columns[i], true))
        .join("")}</row>`,
    );
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${rowsXml.join("")}</sheetData>
${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${orientationOf(report)}" fitToWidth="1" fitToHeight="${fit?.pages ?? 0}"/>
</worksheet>`;

  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escape(sheetName(report.sheet))}" sheetId="1" r:id="rId1"/></sheets>${
        // O cabeçalho da tabela se repete no alto de cada folha impressa.
        `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${escape(sheetName(report.sheet).replace(/'/g, "''"))}'!$${HEADER_ROW}:$${HEADER_ROW}</definedName></definedNames>`
      }</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}
