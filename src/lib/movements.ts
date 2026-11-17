// Regras do lançamento de entrada e perda, iguais às do site (entradas/actions.ts, saveMovements).
import { formatQty } from "./dates.ts";

export type Kind = "entrada" | "perda";
export type MovementProduct = {
  id: string;
  name: string;
  category: string;
  count_unit: string;
  purchase_unit: string;
  units_per_purchase: number;
};

const parse = (raw: string | undefined) => {
  const text = (raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return text ? Number(text) : null;
};

/** Quantas unidades de contagem o número digitado vira: entrada é em embalagens; perda já é em unidade de contagem. */
export function unitsOf(kind: Kind, product: MovementProduct, raw: string | undefined): number {
  const typed = parse(raw);
  if (typed === null || !Number.isFinite(typed) || typed <= 0) return 0;
  return kind === "entrada" ? typed * Number(product.units_per_purchase) : typed;
}

/** Chegou menos do que falta dos pedidos que já deviam ter chegado: pergunta se o resto ainda vem. */
export function isShort(kind: Kind, product: MovementProduct, raw: string | undefined, outstanding: number | undefined): boolean {
  const units = unitsOf(kind, product, raw);
  return kind === "entrada" && (outstanding ?? 0) > 0 && units > 0 && units < (outstanding ?? 0);
}

/** "em caixa (1 caixa = 10 kg)" ou "em kg". */
export function unitHint(kind: Kind, p: MovementProduct): string {
  if (kind === "perda") return `em ${p.count_unit}`;
  const upp = Number(p.units_per_purchase);
  return `em ${p.purchase_unit}${upp !== 1 || p.purchase_unit !== p.count_unit ? ` (1 ${p.purchase_unit} = ${formatQty(upp)} ${p.count_unit})` : ""}`;
}

export type MovementItem = { product_id: string; typed: number; rest: "vem" | "nao" | null };

/**
 * Confere o formulário como o servidor do site confere e devolve o que gravar, ou a mensagem de erro.
 * Campo vazio fica de fora; zero, negativo ou texto é erro com o nome do produto.
 */
export function validateMovements(
  kind: Kind,
  date: string,
  todayIso: string,
  products: MovementProduct[],
  values: Record<string, string>,
  rest: Record<string, "vem" | "nao">,
  outstanding: Record<string, number>,
): { items: MovementItem[] } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Informe a data." };
  if (date > todayIso) return { error: "A data não pode estar no futuro." };
  const byId = new Map(products.map((p) => [p.id, p]));
  const items: MovementItem[] = [];
  for (const [id, raw] of Object.entries(values)) {
    if (!raw.trim()) continue;
    const product = byId.get(id);
    if (!product) continue;
    const typed = parse(raw);
    if (typed === null || !Number.isFinite(typed) || typed <= 0) return { error: `Quantidade inválida em "${product.name}".` };
    let choice: "vem" | "nao" | null = null;
    if (isShort(kind, product, raw, outstanding[id])) {
      choice = rest[id] ?? null;
      if (!choice) return { error: `Em "${product.name}", chegou menos do que o pedido. Diga se o resto ainda vem.` };
    }
    items.push({ product_id: id, typed, rest: choice });
  }
  if (items.length === 0) return { error: "Informe a quantidade de pelo menos um produto." };
  return { items };
}

/**
 * Quanto falta chegar dos pedidos que já deviam ter chegado (o site faz markDue + dueOutstanding).
 * Recebe os itens do mais antigo para o mais novo. Se nenhum venceu, vale o mais antigo.
 */
export function dueOutstanding(items: { outstanding: number; expectedOn: string }[], todayIso: string): number {
  const anyDue = items.some((it) => it.expectedOn <= todayIso);
  return items.reduce((sum, it, i) => sum + ((anyDue ? it.expectedOn <= todayIso : i === 0) ? it.outstanding : 0), 0);
}
