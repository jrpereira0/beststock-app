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

// Estilos: 1 cabeçalho, 2 texto, 3 número, 4 dinheiro, 5 total em texto, 6 total em dinheiro, 7 total em número.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.###"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref: string, value: Cell, column: Column, total: boolean): string {
  const numeric = column.kind === "number" || column.kind === "money";
  if (typeof value === "number" && Number.isFinite(value)) {
    const style = column.kind === "money" ? (total ? 6 : 4) : total ? 7 : 3;
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  const style = total ? 5 : numeric ? 3 : column.align === "right" ? 8 : 2;
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

export function toXlsx(report: Report): Uint8Array<ArrayBuffer> {
  const cols = report.columns;
  const lines = withSeparators(report);
  const widths = cols.map((c, i) => {
    let longest = c.label.length;
    for (const row of report.rows) {
      const v = row[i];
      const text = typeof v === "number" ? (c.kind === "money" ? v.toFixed(2) + "R$ " : String(v)) : (v ?? "");
      longest = Math.max(longest, text.length);
    }
    return Math.min(48, Math.max(10, longest + 3));
  });

  const rowsXml: string[] = [];
  let r = 1;
  rowsXml.push(
    `<row r="${r}">${cols.map((c, i) => `<c r="${columnName(i)}${r}" s="${c.align === "right" ? 9 : 1}" t="inlineStr"><is><t>${escape(c.label)}</t></is></c>`).join("")}</row>`,
  );
  for (const line of lines) {
    r++;
    if (!line) {
      rowsXml.push(`<row r="${r}"/>`);
      continue;
    }
    rowsXml.push(`<row r="${r}">${line.map((v, i) => cellXml(`${columnName(i)}${r}`, v, cols[i], false)).join("")}</row>`);
  }
  if (report.total) {
    r++;
    rowsXml.push(`<row r="${r}">${report.total.map((v, i) => cellXml(`${columnName(i)}${r}`, v, cols[i], true)).join("")}</row>`);
  }

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${rowsXml.join("")}</sheetData>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${orientationOf(report)}" fitToWidth="1" fitToHeight="0"/>
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
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escape(sheetName(report.sheet))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
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
