// Copiado de beststock/src/lib/invoice.ts por scripts/copiar-do-site.mjs. Não edite aqui.
/**
 * Leitura do XML da nota fiscal eletrônica (NF-e) para lançar a entrada sem digitar.
 * Funciona no navegador e no servidor: lê o texto do XML, sem depender de bibliotecas.
 */

export type InvoiceItem = {
  /** Código do produto no fornecedor (cProd). */
  code: string;
  /** Código de barras (cEAN), quando a nota traz. */
  ean: string;
  name: string;
  /** Unidade da nota: CX, UN, KG… */
  unit: string;
  quantity: number;
  unitPrice: number;
};

export type Invoice = {
  /** Chave de acesso de 44 dígitos. */
  key: string;
  number: string;
  /** Data de emissão, AAAA-MM-DD. */
  issuedOn: string;
  issuerName: string;
  /** CNPJ (ou CPF) de quem emitiu: junto com o código do item, identifica o produto nas próximas notas. */
  issuerId: string;
  items: InvoiceItem[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : all;
      }
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .trim();
}

/** Primeiro conteúdo da etiqueta, com ou sem prefixo de namespace (nfe:xProd). */
function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`));
  return match ? decode(match[1]) : "";
}

function block(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`));
  return match ? match[1] : "";
}

const number = (text: string) => {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Lê a NF-e. Devolve um erro em português quando o arquivo não é uma nota fiscal. */
export function parseInvoice(xml: string): Invoice | { error: string } {
  if (!/<(?:[\w-]+:)?infNFe[\s>]/.test(xml)) {
    return { error: "Este arquivo não é o XML de uma nota fiscal eletrônica (NF-e)." };
  }
  const idAttr = xml.match(/<(?:[\w-]+:)?infNFe[^>]*\sId="NFe(\d{44})"/);
  const key = idAttr?.[1] ?? tag(xml, "chNFe").replace(/\D/g, "");
  const ide = block(xml, "ide");
  const emit = block(xml, "emit");
  const issued = tag(ide, "dhEmi") || tag(ide, "dEmi");
  const items: InvoiceItem[] = [];
  for (const det of xml.matchAll(/<(?:[\w-]+:)?det\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?det>/g)) {
    const prod = block(det[1], "prod");
    const ean = tag(prod, "cEAN");
    items.push({
      code: tag(prod, "cProd"),
      ean: /^\d{8,14}$/.test(ean) ? ean : "",
      name: tag(prod, "xProd"),
      unit: tag(prod, "uCom").toUpperCase(),
      quantity: number(tag(prod, "qCom")),
      unitPrice: number(tag(prod, "vUnCom")),
    });
  }
  if (items.length === 0) return { error: "A nota não tem nenhum produto." };
  if (key.length !== 44) return { error: "Não foi possível ler a chave de acesso da nota." };
  return {
    key,
    number: tag(ide, "nNF"),
    issuedOn: /^\d{4}-\d{2}-\d{2}/.test(issued) ? issued.slice(0, 10) : "",
    issuerName: tag(emit, "xFant") || tag(emit, "xNome"),
    issuerId: tag(emit, "CNPJ") || tag(emit, "CPF"),
    items,
  };
}

// ---------- produto da nota ↔ produto da loja ----------

/** Palavras do nome sem acento, sem pontuação e sem o que não ajuda a reconhecer o produto. */
const IGNORE = new Set(["de", "da", "do", "das", "dos", "com", "c", "e", "the", "best", "kg", "g", "gr", "ml", "l", "lt", "un", "cx", "und"]);
export function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !IGNORE.has(w) && !/^\d+$/.test(w));
}

/** Parecença entre dois nomes, de 0 a 1: quantas palavras os dois têm em comum. */
export function similarity(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return (2 * common) / (wa.size + wb.size);
}

/** O produto da loja com o nome mais parecido, se for parecido o bastante para sugerir. */
export function bestMatch<T extends { id: string; name: string }>(name: string, products: T[]): T | null {
  let best: T | null = null;
  let score = 0;
  for (const p of products) {
    const s = similarity(name, p.name);
    if (s > score) {
      best = p;
      score = s;
    }
  }
  return score >= 0.6 ? best : null;
}
