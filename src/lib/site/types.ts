// Copiado de beststock/src/lib/types.ts por scripts/copiar-do-site.mjs. Não edite aqui.
export type Store = {
  id: string;
  name: string;
  city: string;
  active: boolean;
  count_interval_days: number;
  created_at: string;
  owner_name: string;
  phone: string;
  document: string;
  address: string;
  /** Plano que define o valor e de quanto em quanto tempo a unidade é cobrada. */
  plan_id: string | null;
  due_day: number;
  payment_method: PaymentMethod;
  /** A unidade está sendo cobrada? */
  billing_active: boolean;
  /** Mês da primeira cobrança do plano (AAAA-MM-01). */
  billing_start: string | null;
  blocked_at: string | null;
  blocked_reason: string;
};

export type Plan = {
  id: string;
  name: string;
  description: string;
  /** Valor cobrado a cada período. */
  price: number;
  /** De quantos em quantos meses o plano é cobrado. */
  duration_months: number;
  active: boolean;
};

export type PaymentMethod = "pix" | "boleto" | "cartao_credito" | "cartao_debito" | "transferencia" | "dinheiro";

export type Payment = {
  id: string;
  store_id: string;
  reference_month: string;
  description: string;
  /** Cobrança gerada pelo plano da unidade (as avulsas são lançadas à mão). */
  recurring: boolean;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "cancelado";
  paid_on: string | null;
  method: PaymentMethod | null;
  note: string;
};

export type Announcement = {
  id: string;
  store_id: string | null;
  title: string;
  body: string;
  level: "info" | "warn";
  created_at: string;
};

export type StoreAccess = "gerente" | "funcionario";

export type Profile = {
  id: string;
  role: "admin" | "store";
  store_id: string | null;
  name: string;
  email: string;
  /** Na loja: o gerente compra, cadastra e vê os valores; o funcionário conta e lança entradas e perdas. */
  access: StoreAccess;
  store: Store | null;
};

export type StorageKind = "gelado" | "seco";

export type Supplier = {
  id: string;
  store_id: string;
  name: string;
  contact: string;
  /** Dias para entregar produto gelado. */
  lead_time_days: number;
  /** Dias para entregar produto seco. */
  lead_time_dry_days: number;
};

export type ProductFields = {
  name: string;
  category: string;
  /** Gelado usa o prazo dos gelados do fornecedor; seco usa o prazo dos secos. */
  storage: StorageKind;
  count_unit: string;
  purchase_unit: string;
  units_per_purchase: number;
  shelf_life_days: number | null;
  /** Posição na planilha da loja, dentro da categoria. Sem posição, fica no fim, em ordem alfabética. */
  position?: number | null;
};

export type CatalogProduct = ProductFields & {
  id: string;
  /** Custo da rede por embalagem. Vale para todas as lojas que não mudaram o custo do produto. */
  cost_per_purchase: number;
};

export type Product = ProductFields & {
  id: string;
  store_id: string;
  supplier_id: string | null;
  cost_per_purchase: number;
  /** Item da lista padrão de onde o produto veio, se veio. */
  catalog_product_id: string | null;
  /** A loja mudou o custo por conta própria: o custo da rede não altera mais este produto. */
  custom_cost: boolean;
  min_stock: number;
  /** Item que para a loja se faltar: a compra guarda a folga da classe A. */
  essential: boolean;
  active: boolean;
};

export type FormState = { error?: string; ok?: string } | null;

export type Inventory = {
  id: string;
  store_id: string;
  counted_on: string;
  status: "draft" | "closed";
  closed_at: string | null;
  created_by?: string | null;
  closed_by?: string | null;
};

export type Movement = {
  id: string;
  product_id: string;
  kind: "entrada" | "perda";
  moved_on: string;
  quantity: number;
  packages: number | null;
  /** Login que lançou. */
  created_by?: string | null;
};
