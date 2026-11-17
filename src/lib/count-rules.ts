// Regras da contagem, iguais às do site (inventario/actions.ts e inventario/[id]/count-list.tsx).
import { addDays, formatQty } from "./dates.ts";

export type CountProduct = { id: string; name: string; category: string; count_unit: string };

/** Número sem nada para comparar (primeira contagem do produto) que provavelmente foi digitado errado. */
export const HIGH_WITHOUT_HISTORY = 1000;

/** "1.000" no Brasil é mil, mas vira 1 na conta. */
export const looksLikeThousands = (text: string) => /^\d{1,3}(\.\d{3})+$/.test(text.trim());

/**
 * Lê o que foi digitado como o servidor do site lê: tira espaços e troca a vírgula por ponto.
 * Vazio é null (produto não contado). Número inválido ou negativo é NaN.
 */
export function parseQty(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}

export const isZero = (text: string) => parseQty(text) === 0;
export const isBlank = (text: string) => text.trim() === "";

/** Mostra uma quantidade salva no campo: "1,5", sem separador de milhar (que seria lido como decimal). */
export const toField = (n: number) => formatQty(n).replace(/\./g, "");

/** Aperta − ou +: vazio com + vira 1; com − não passa de zero. Mantém decimais. */
export function step(text: string, delta: 1 | -1): string {
  const n = parseQty(text);
  const base = n === null || Number.isNaN(n) ? 0 : n;
  const next = Math.max(0, Math.round((base + delta) * 1000) / 1000);
  if ((n === null || Number.isNaN(n)) && delta < 0) return "0";
  return toField(next);
}

export type Warning = { kind: "invalid" | "tooMuch" | "thousands" | "veryHigh"; text: string };

/** Avisos de número estranho, os mesmos do site. Não impedem salvar: pedem uma conferida. */
export function countWarnings(raw: string, unit: string, maxPossible: number | undefined): Warning[] {
  if (isBlank(raw)) return [];
  const typed = parseQty(raw);
  if (typed === null) return [];
  if (Number.isNaN(typed)) return [{ kind: "invalid", text: "Número inválido. Use só números e vírgula para decimal." }];
  const out: Warning[] = [];
  if (maxPossible !== undefined && typed > maxPossible * 1.02 + 0.001) {
    out.push({
      kind: "tooMuch",
      text: `Mais do que o possível: pelas contas havia no máximo ${formatQty(Math.max(0, maxPossible))} ${unit} (contagem anterior mais o que entrou). Confira o número. Se chegou mercadoria, lance a entrada.`,
    });
  }
  const thousands = looksLikeThousands(raw);
  if (thousands) {
    out.push({
      kind: "thousands",
      text: `Você digitou ${raw.trim()}, que o sistema lê como ${formatQty(typed)} ${unit}. Se quis dizer ${raw.trim().replaceAll(".", "")}, digite sem o ponto. Para decimal, use vírgula.`,
    });
  }
  if (!thousands && maxPossible === undefined && typed >= HIGH_WITHOUT_HISTORY) {
    out.push({
      kind: "veryHigh",
      text: `${formatQty(typed)} ${unit} é bastante. Confira se o número está certo e se é na unidade de contagem (${unit}).`,
    });
  }
  return out;
}

/** Dias que podem ser escolhidos em "Acabou em": depois da contagem anterior até o dia desta. */
export function stockoutRange(previousOn: string | null, countedOn: string): { min: string; max: string } | null {
  if (!previousOn) return null;
  return { min: addDays(previousOn, 1), max: countedOn };
}

/** A mesma conferência do servidor do site: o dia precisa estar entre a contagem anterior e esta. */
export function validStockout(day: string, previousOn: string | null, countedOn: string): boolean {
  return Boolean(previousOn) && day > (previousOn as string) && day <= countedOn;
}

// ---- Busca e categorias ----

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

// Ordem da contagem na loja (igual ao site). "acompanhamento" vem antes de "acomp".
const ORDER = ["acai", "sorvete", "acompanhamento", "pote", "revenda", "acomp"];
function rank(name: string) {
  const n = normalize(name);
  const i = ORDER.findIndex((key) => n.startsWith(key));
  return i === -1 ? ORDER.length : i;
}
export function compareCategories(a: string, b: string) {
  const byRank = rank(a) - rank(b);
  return byRank !== 0 ? byRank : a.localeCompare(b, "pt-BR");
}

/** Agrupa por categoria na ordem da loja, filtrando por busca (sem acento) e por categoria. */
export function groupProducts<T extends CountProduct>(
  products: T[],
  opts: { search?: string; category?: string | null; keep?: (p: T) => boolean } = {},
): [string, T[]][] {
  const term = normalize((opts.search ?? "").trim());
  const groups = new Map<string, T[]>();
  for (const p of products) {
    const cat = p.category || "Sem categoria";
    if (opts.category && cat !== opts.category) continue;
    if (term && !normalize(p.name).includes(term)) continue;
    if (opts.keep && !opts.keep(p)) continue;
    groups.set(cat, [...(groups.get(cat) ?? []), p]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return [...groups].sort((a, b) => compareCategories(a[0], b[0]));
}

export function categoriesOf(products: CountProduct[]): string[] {
  return [...new Set(products.map((p) => p.category || "Sem categoria"))].sort(compareCategories);
}

// ---- Dados que a tela de contagem usa (mesma conta do site) ----

type Movement = { product_id: string; kind: string; moved_on: string; quantity: number; after_count: boolean | null };

/**
 * O máximo que pode haver na prateleira (contagem anterior + entradas − perdas) e a última entrada de cada
 * produto. Entrega lançada depois da contagem, no mesmo dia, não estava na prateleira.
 */
export function maxPossibleFrom(previous: Record<string, number>, movements: Movement[], countedOn: string) {
  const maxPossible: Record<string, number> = { ...previous };
  const lastEntrada: Record<string, string> = {};
  for (const m of movements) {
    if (m.kind === "entrada" && m.after_count && m.moved_on === countedOn) continue;
    if (maxPossible[m.product_id] !== undefined) {
      maxPossible[m.product_id] += m.kind === "entrada" ? Number(m.quantity) : -Number(m.quantity);
    }
    if (m.kind !== "entrada") continue;
    if (!lastEntrada[m.product_id] || m.moved_on > lastEntrada[m.product_id]) lastEntrada[m.product_id] = m.moved_on;
  }
  return { maxPossible, lastEntrada };
}
