// Copiado de beststock/src/lib/transfer-stock.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// Quanto a loja tem de cada produto para mandar para outra: a última contagem + o que entrou − o que saiu desde
// então (a mesma conta de "estoque contado" da lista de compras). Sem dependências: o site e o app usam a mesma.

export type StockParts = { on: string; quantity: number; entries: number; losses: number };

/** Quanto há agora, ou null quando o produto não foi contado na última contagem (não dá para saber). */
export function stockTotal(parts: StockParts | null | undefined): number | null {
  if (!parts) return null;
  return Math.max(0, Math.round((parts.quantity + parts.entries - parts.losses) * 1000) / 1000);
}

/**
 * Confere as quantidades a transferir contra o que há em estoque. Produto sem contagem não tem limite (a tela
 * avisa que não dá para saber). Devolve a mensagem do primeiro produto que passa do que tem, ou null.
 */
export function checkTransferStock(
  items: { product_id: string; quantity: number }[],
  stock: Record<string, StockParts | null | undefined>,
  names: Record<string, string>,
  unitOf: Record<string, string>,
): string | null {
  for (const it of items) {
    const total = stockTotal(stock[it.product_id]);
    if (total === null) continue;
    if (it.quantity > total + 1e-9) {
      const n = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");
      return `Em "${names[it.product_id] ?? "produto"}" você está mandando ${n(it.quantity)} ${unitOf[it.product_id] ?? ""}, mas só há ${n(total)} ${unitOf[it.product_id] ?? ""} em estoque (última contagem mais as entradas, menos as saídas). Confira a contagem ou mande menos.`.replace(/ +/g, " ");
    }
  }
  return null;
}
