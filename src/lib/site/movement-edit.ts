// Copiado de beststock/src/lib/movement-edit.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// Corrigir um lançamento de entrada ou perda: a data e a quantidade. O produto e o tipo não mudam (para isso,
// exclua e lance de novo). Sem dependências: o site (entradas/actions.ts) e o app usam a mesma regra.

export type MovementEditInput = {
  kind: "entrada" | "perda";
  /** Data nova (AAAA-MM-DD). */
  date: string;
  today: string;
  /** Quantidade digitada: embalagens de compra na entrada, unidades de contagem na perda. */
  typed: number | null;
  /** Unidades de contagem em cada embalagem de compra do produto. */
  unitsPerPurchase: number;
  /** Quantidade gravada hoje (em unidades de contagem). */
  oldQuantity: number;
  /** Quanto desta entrada já baixou de pedidos de compra (em unidades de contagem). */
  receivedOnOrders: number;
};

export type MovementPatch = { moved_on: string; quantity: number; packages: number | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function planMovementEdit(input: MovementEditInput): { error: string } | { patch: MovementPatch } {
  const { kind, date, typed } = input;
  if (!ISO.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return { error: "Informe a data." };
  if (date > input.today) return { error: "A data não pode estar no futuro." };
  if (typed === null || !Number.isFinite(typed) || typed <= 0) return { error: "Informe uma quantidade maior que zero." };
  const quantity = kind === "entrada" ? Math.round(typed * input.unitsPerPurchase * 1000) / 1000 : typed;
  // A entrada que baixou um pedido de compra: mudar a quantidade deixaria o pedido com a conta errada.
  if (input.receivedOnOrders > 0 && Math.abs(quantity - input.oldQuantity) > 1e-9) {
    return {
      error: "Esta entrada já deu baixa em um pedido de compra. Para mudar a quantidade, exclua e lance de novo.",
    };
  }
  return { patch: { moved_on: date, quantity, packages: kind === "entrada" ? typed : null } };
}

/** Número digitado com vírgula ou ponto; vazio ou inválido vira null. */
export function parseTyped(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
