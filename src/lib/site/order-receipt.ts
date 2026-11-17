// Copiado de beststock/src/lib/order-receipt.ts por scripts/copiar-do-site.mjs. Não edite aqui.
/** Item de pedido aberto, na ordem em que deve ser abatido (o mais antigo primeiro). */
export type OpenOrderItem = {
  id: string;
  orderId: string;
  outstanding: number;
  received: number;
  /**
   * Pedido que já devia ter chegado (ou o mais antigo, se nenhum venceu). É sobre ele que a loja
   * responde se o resto ainda vem. Ausente conta como vencido.
   */
  due?: boolean;
};

export type ArrivalResult = {
  items: OpenOrderItem[];
  /** Quantidade desta entrada aplicada em cada item. */
  applied: { id: string; quantity: number }[];
};

const EPS = 1e-9;

/**
 * Marca quais itens abertos de um produto já deviam ter chegado até `today`.
 * Recebe os itens do mais antigo para o mais novo. Se nenhum venceu, o mais antigo é o esperado.
 */
export function markDue<T extends { expectedOn: string }>(items: T[], today: string): (T & { due: boolean })[] {
  const anyDue = items.some((it) => it.expectedOn <= today);
  return items.map((it, i) => ({ ...it, due: anyDue ? it.expectedOn <= today : i === 0 }));
}

/** Quanto falta chegar dos pedidos que já deviam ter chegado. */
export const dueOutstanding = (items: OpenOrderItem[]) =>
  items.reduce((a, it) => a + (it.due === false ? 0 : it.outstanding), 0);

/**
 * Abate uma entrada nos pedidos abertos, do mais antigo para o mais novo.
 * `restWillCome` falso dispensa o que sobrou dos pedidos que já deviam ter chegado: o fornecedor
 * não vai mandar o restante. Um pedido mais novo, ainda dentro do prazo, continua a caminho.
 * Quantidade que passa do pedido fica só no estoque, sem aumentar o pedido.
 */
export function applyArrival(items: OpenOrderItem[], arrived: number, restWillCome: boolean): ArrivalResult {
  let left = Math.max(0, arrived);
  const next = items.map((it) => ({ ...it }));
  const applied: { id: string; quantity: number }[] = [];
  for (const it of next) {
    if (left <= EPS || it.outstanding <= EPS) continue;
    const take = Math.min(it.outstanding, left);
    it.received += take;
    it.outstanding -= take;
    left -= take;
    applied.push({ id: it.id, quantity: take });
  }
  if (!restWillCome) {
    for (const it of next) if (it.due !== false) it.outstanding = 0;
  }
  return { items: next, applied };
}

/** Devolve ao pedido a quantidade de uma entrada que foi apagada. */
export function reverseReceipt(item: OpenOrderItem, quantity: number): OpenOrderItem {
  const take = Math.min(item.received, Math.max(0, quantity));
  return { ...item, received: item.received - take, outstanding: item.outstanding + take };
}
