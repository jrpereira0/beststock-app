// Copiado de beststock/src/lib/category-order.ts por scripts/copiar-do-site.mjs. Não edite aqui.
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

// Ordem da contagem na loja. "acompanhamento" vem antes de "acomp" para não pegar "Acomp. Congelado".
const ORDER = ["acai", "sorvete", "acompanhamento", "pote", "revenda", "acomp"];

function rank(name: string) {
  const n = normalize(name);
  const i = ORDER.findIndex((key) => n.startsWith(key));
  return i === -1 ? ORDER.length : i;
}

/** Açaí, sorvetes, acompanhamentos, potes, revenda e acompanhamento congelado. O resto vai para o fim. */
export function compareCategories(a: string, b: string) {
  const byRank = rank(a) - rank(b);
  return byRank !== 0 ? byRank : a.localeCompare(b, "pt-BR");
}

type Sortable = { name: string; category: string; position?: number | null };

/**
 * Ordem dos produtos: categoria, depois a posição da planilha da loja (products.position, vinda da lista
 * padrão) e, para quem não tem posição, o nome em ordem alfabética, no fim da categoria.
 */
export function compareProducts(a: Sortable, b: Sortable) {
  const byCategory = compareCategories(a.category || "Sem categoria", b.category || "Sem categoria");
  if (byCategory !== 0) return byCategory;
  const pa = a.position ?? Number.POSITIVE_INFINITY;
  const pb = b.position ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa < pb ? -1 : 1;
  return a.name.localeCompare(b.name, "pt-BR");
}
