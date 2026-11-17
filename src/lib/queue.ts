// Contagens que ainda não chegaram ao banco ficam guardadas no aparelho, por contagem.
// A mesma ideia do site (localStorage), aqui no armazenamento do app, que sobrevive a fechar o app.

export type PendingItem = { value: string; stockout: string | null };
export type Pending = Record<string, PendingItem>;

/** O pedaço do AsyncStorage que a fila usa (assim os testes rodam com um armazenamento de mentira). */
export type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const queueKey = (inventoryId: string) => `beststock:contagem:${inventoryId}`;

export async function readQueue(storage: KeyValue, inventoryId: string): Promise<Pending> {
  try {
    const raw = await storage.getItem(queueKey(inventoryId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Pending) : {};
  } catch {
    return {};
  }
}

export async function writeQueue(storage: KeyValue, inventoryId: string, queue: Pending): Promise<void> {
  if (Object.keys(queue).length === 0) await storage.removeItem(queueKey(inventoryId));
  else await storage.setItem(queueKey(inventoryId), JSON.stringify(queue));
}

/** Resultado de enviar um número: chegou, o banco recusou (com a mensagem) ou faltou internet. */
export type SendResult = { ok: true } | { ok: false; error: string } | { ok: false; offline: true };

/**
 * Envia o que está guardado, um por um, na ordem em que foi guardado. Para no primeiro que falhar por
 * falta de internet (o resto fica para a próxima). O que o banco recusou também sai da fila, com o erro
 * para a tela mostrar: guardar de novo não adiantaria. `done` é chamado para cada um que saiu.
 * Devolve false se parou por falta de internet.
 */
export async function flushQueue(
  queue: Pending,
  send: (productId: string, item: PendingItem) => Promise<SendResult>,
  done: (productId: string, item: PendingItem, result: Exclude<SendResult, { offline: true }>) => void | Promise<void>,
): Promise<boolean> {
  for (const [id, item] of Object.entries(queue)) {
    const res = await send(id, item);
    if (!res.ok && "offline" in res) return false;
    await done(id, item, res as Exclude<SendResult, { offline: true }>);
  }
  return true;
}

/**
 * Tira um produto da fila depois de enviado, mas só se ninguém mudou o número enquanto ele ia:
 * se a pessoa digitou outro valor no meio do envio, o novo continua guardado para ir depois.
 */
export function removeIfSame(queue: Pending, productId: string, item: PendingItem): Pending {
  const now = queue[productId];
  if (!now || now.value !== item.value || now.stockout !== item.stockout) return queue;
  const next = { ...queue };
  delete next[productId];
  return next;
}

/** Falha de rede (sem resposta do servidor) e não recusa do banco. */
export function isNetworkError(error: { code?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    (!error.code && !error.status)
  );
}
