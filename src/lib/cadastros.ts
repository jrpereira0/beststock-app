// Conferências do cadastro de produto e fornecedor, iguais às do site (lib/form.ts e (app)/actions.ts).

const num = (raw: string | undefined): number | null => {
  const text = (raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
const int = (raw: string | undefined) => {
  const n = num(raw);
  return n === null ? null : Math.round(n);
};

export type ProductInput = {
  name: string;
  category: string;
  storage: string;
  count_unit: string;
  purchase_unit: string;
  units_per_purchase: string;
  shelf_life_days: string;
  cost_per_purchase: string;
  min_stock: string;
  supplier_id: string;
  active: boolean;
  essential: boolean;
};

export type ProductRow = {
  name: string;
  category: string;
  storage: "gelado" | "seco";
  count_unit: string;
  purchase_unit: string;
  units_per_purchase: number;
  shelf_life_days: number | null;
  cost_per_purchase: number;
  min_stock: number;
  supplier_id: string | null;
  active: boolean;
  essential: boolean;
};

export function productRow(f: ProductInput): { row: ProductRow } | { error: string } {
  const name = f.name.trim();
  const units = num(f.units_per_purchase) ?? 1;
  const shelf = int(f.shelf_life_days);
  if (!name) return { error: "Informe o nome do produto." };
  if (f.storage !== "gelado" && f.storage !== "seco") return { error: "Informe se o produto é gelado ou seco." };
  if (units <= 0) return { error: "A quantidade por embalagem deve ser maior que zero." };
  if (shelf !== null && shelf <= 0) return { error: "A validade deve ser maior que zero." };
  const cost = num(f.cost_per_purchase) ?? 0;
  const min = num(f.min_stock) ?? 0;
  if (cost < 0 || min < 0) return { error: "Custo e estoque mínimo não podem ser negativos." };
  return {
    row: {
      name,
      category: f.category.trim(),
      storage: f.storage,
      count_unit: f.count_unit.trim() || "un",
      purchase_unit: f.purchase_unit.trim() || "un",
      units_per_purchase: units,
      shelf_life_days: shelf,
      cost_per_purchase: cost,
      min_stock: min,
      supplier_id: f.supplier_id || null,
      active: f.active,
      essential: f.essential,
    },
  };
}

/** Trocar a unidade de contagem de produto com histórico mistura números de unidades diferentes. */
export const sameUnit = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export type SupplierInput = { name: string; contact: string; lead_time_days: string; lead_time_dry_days: string };
export function supplierRow(f: SupplierInput) {
  const name = f.name.trim();
  const lead = int(f.lead_time_days) ?? 7;
  const leadDry = int(f.lead_time_dry_days) ?? 12;
  if (!name) return { error: "Informe o nome do fornecedor." } as const;
  if (lead < 0 || lead > 60 || leadDry < 0 || leadDry > 60) return { error: "Cada prazo de entrega deve ficar entre 0 e 60 dias." } as const;
  return { row: { name, contact: f.contact.trim(), lead_time_days: lead, lead_time_dry_days: leadDry } } as const;
}

export function intervalDays(raw: string): number | { error: string } {
  const days = int(raw);
  if (days === null || days < 1 || days > 90) return { error: "O período de contagem deve ficar entre 1 e 90 dias." };
  return days;
}

export const UNITS = ["un", "kg", "g", "L", "ml", "pote", "balde", "caixa", "pacote", "fardo", "saco"];
