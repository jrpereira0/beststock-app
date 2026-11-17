// Monta a lista de compras por fornecedor e tipo, igual a compras/page.tsx do site.
import { formatQty } from "./dates.ts";
import type { StockPlan } from "./site/planning";

export type PurchaseRow = {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  countUnit: string;
  perPack: number;
  costPerPurchase: number;
  current: number;
  coverageDays: number | null;
  weekly: number | null;
  target: number;
  byMinimum: boolean;
  packs: number;
  inTransit: number;
  risk: boolean;
  notes: string[];
};
export type PurchaseGroup = {
  key: string;
  supplierId: string | null;
  storage: "gelado" | "seco";
  supplier: string;
  detail: string;
  horizonDays: number;
  rows: PurchaseRow[];
};

/** Quantos dias a sugestão cobre a partir de hoje (igual ao site). */
export function coverText(coverDays: number, daysSince: number, interval: number, lead: string | null): string {
  const days = `${coverDays} ${coverDays === 1 ? "dia" : "dias"}`;
  const left = Math.max(0, interval - daysSince);
  const fromToday = daysSince > 0 ? " a partir de hoje" : "";
  if (left === 0) {
    return lead
      ? `A sugestão cobre ${days} a partir de hoje: só ${lead}, porque a contagem já está no dia.`
      : "A sugestão cobre só até a próxima contagem, que já está no dia.";
  }
  return `A sugestão cobre ${days}${fromToday}: ${left} até a próxima contagem${lead ? ` e ${lead}` : ""}.`;
}

export function purchaseGroups(plan: StockPlan, interval: number): PurchaseGroup[] {
  const groups = new Map<string, PurchaseGroup>();
  for (const item of plan.items) {
    if (item.current === null || (item.suggestedPacks <= 0 && item.inTransit <= 0)) continue;
    const storage = item.product.storage ?? "gelado";
    const key = `${item.supplier?.id ?? "none"}:${storage}`;
    if (!groups.has(key)) {
      const kind = storage === "seco" ? "Secos" : "Gelados";
      groups.set(key, {
        key,
        supplierId: item.supplier?.id ?? null,
        storage,
        supplier: item.supplier ? `${item.supplier.name} · ${kind}` : `Sem fornecedor · ${kind}`,
        detail: item.supplier
          ? item.leadDays > 0
            ? coverText(item.coverDays, item.daysSinceCount, interval, `${item.leadDays} de entrega dos ${kind.toLowerCase()}`)
            : `Entrega no mesmo dia. ${coverText(item.coverDays, item.daysSinceCount, interval, null)}`
          : `Produtos sem fornecedor. ${coverText(item.coverDays, item.daysSinceCount, interval, null)}`,
        horizonDays: item.coverDays,
        rows: [],
      });
    }
    groups.get(key)!.rows.push({
      id: item.product.id,
      name: item.product.name,
      category: item.product.category,
      purchaseUnit: item.product.purchase_unit,
      countUnit: item.product.count_unit,
      perPack: item.product.units_per_purchase,
      costPerPurchase: item.product.cost_per_purchase,
      current: Math.round(item.current * 10) / 10,
      coverageDays: item.coverageDays,
      weekly: item.dailyAvg !== null ? item.dailyAvg * 7 : null,
      target: item.needed,
      byMinimum: item.product.min_stock > 0 && item.needed <= item.product.min_stock + 1e-9,
      packs: item.suggestedPacks,
      inTransit: item.inTransit,
      risk: item.status === "falta",
      notes: item.notes,
    });
  }
  const none = (key: string) => key.startsWith("none:");
  const list = [...groups.values()].sort((a, b) => {
    if (none(a.key) !== none(b.key)) return none(a.key) ? 1 : -1;
    return a.supplier.localeCompare(b.supplier, "pt");
  });
  for (const g of list) g.rows.sort((a, b) => Number(b.risk) - Number(a.risk) || a.name.localeCompare(b.name));
  return list;
}

export function parsePacks(text: string): number {
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Texto do pedido para copiar ou mandar pelo WhatsApp (igual ao site). */
export function orderText(storeName: string, rows: { name: string; purchaseUnit: string; packs: number }[]): string {
  return [`Pedido - ${storeName}`, ...rows.filter((r) => r.packs > 0).map((r) => `${formatQty(r.packs)} ${r.purchaseUnit} - ${r.name}`)].join("\n");
}

/** Uma casa decimal, arredondando para cima, para "precisa − tem" nunca parecer menor que a compra. */
export const roundUp = (n: number) => Math.ceil(n * 10 - 1e-6) / 10;
