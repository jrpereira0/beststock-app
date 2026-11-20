// Copiado de beststock/src/lib/select-all.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// A API do Supabase devolve no máximo 1000 linhas por busca. Para as poucas listas que precisam de todas as linhas
// (os nomes das unidades num seletor, por exemplo), esta função busca em partes até acabar. Sem dependências:
// o site e o app usam a mesma.

export const PAGE_ROWS = 1000;

/**
 * `page(from, to)` faz a busca com `.range(from, to)` (e uma ordem fixa, para as partes não se repetirem).
 * Para em 50 mil linhas, por segurança.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) break;
  }
  return out;
}
