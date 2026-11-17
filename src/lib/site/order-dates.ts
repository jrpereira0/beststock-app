// Copiado de beststock/src/lib/order-dates.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// Regras de data de um pedido feito por fora da lista. Sem dependências, para testar direto (scripts/test-planning.mjs).

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isIso = (v: string) => ISO.test(v) && !Number.isNaN(Date.parse(v));
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Quantos dias para trás a loja pode lançar um pedido. Mais velho que isso quase certamente já chegou. */
export const MAX_ORDER_AGE_DAYS = 90;
/** A previsão de chegada não passa disto depois do dia do pedido. */
export const MAX_ORDER_WAIT_DAYS = 120;

/** Previsão de chegada padrão: o dia do pedido mais o prazo do fornecedor. */
export const expectedFrom = (orderedOn: string, leadDays: number) => shift(orderedOn, leadDays);

/** Mensagem de erro das datas de um pedido, ou nulo se estão certas. */
export function orderDateError(orderedOn: string, expectedOn: string, today: string): string | null {
  if (!isIso(orderedOn)) return "Informe o dia em que fez o pedido.";
  if (orderedOn > today) return "O dia do pedido não pode estar no futuro.";
  if (orderedOn < shift(today, -MAX_ORDER_AGE_DAYS)) {
    return `O pedido tem mais de ${MAX_ORDER_AGE_DAYS} dias. Pedido tão antigo já chegou: lance a entrada em vez do pedido.`;
  }
  if (!isIso(expectedOn)) return "Informe a previsão de chegada.";
  if (expectedOn < orderedOn) return "A previsão de chegada não pode ser antes do dia do pedido.";
  if (expectedOn > shift(orderedOn, MAX_ORDER_WAIT_DAYS)) {
    return `A previsão de chegada está a mais de ${MAX_ORDER_WAIT_DAYS} dias do pedido. Confira a data.`;
  }
  return null;
}
