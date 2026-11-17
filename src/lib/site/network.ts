// Copiado de beststock/src/lib/network.ts por scripts/copiar-do-site.mjs. Não edite aqui.
/**
 * O fornecedor da rede. Toda loja nova já nasce com ele cadastrado, e os produtos da lista padrão
 * vêm ligados a ele. A loja pode mudar os prazos ou trocar o fornecedor de um produto.
 */
export const NETWORK_SUPPLIER = {
  name: "The Best Açaí Centro de Distribuição",
  lead_time_days: 7,
  lead_time_dry_days: 12,
} as const;
