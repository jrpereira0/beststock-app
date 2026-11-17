// Copiado de beststock/src/lib/setup.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// O que a loja precisa preencher e manter para o consumo e a compra saírem certos.
// Daqui saem a lista da tela Configurações e as notificações de pendência.

import { formatDate } from "./dates";
import { nextCount, type CountDue } from "./inventory-status";
import type { Alert } from "../alert";
import type { StockPlan } from "./planning";

/** O que a loja já preencheu e como está a rotina; vem do cadastro e do cálculo de consumo. */
export type SetupFacts = {
  countIntervalDays: number;
  suppliers: number;
  /** Produtos ativos. */
  products: number;
  withSupplier: number;
  withCost: number;
  withMin: number;
  withShelf: number;
  /** Produtos comprados em embalagem diferente da unidade de contagem. */
  inPacks: number;
  closedCounts: number;
  lastCount: string | null;
  countDue: CountDue | null;
  /** Produtos ativos que ficaram fora da última contagem. */
  notCounted: number;
  /** Produtos com algum período ignorado por consumo negativo. */
  negativePeriods: number;
  /** Produtos em que o período ignorado é o mais recente, entre as duas últimas contagens. */
  negativeLatest: number;
};

export function setupFacts(
  plan: StockPlan,
  extra: { countIntervalDays: number; suppliers: number; closedCounts: number; today: string },
): SetupFacts {
  const products = plan.items.map((i) => i.product);
  return {
    countIntervalDays: extra.countIntervalDays,
    suppliers: extra.suppliers,
    products: products.length,
    withSupplier: plan.items.filter((i) => i.supplier !== null).length,
    withCost: products.filter((p) => p.cost_per_purchase > 0).length,
    withMin: products.filter((p) => p.min_stock > 0).length,
    withShelf: products.filter((p) => p.shelf_life_days !== null).length,
    inPacks: products.filter((p) => p.units_per_purchase !== 1 || p.purchase_unit !== p.count_unit).length,
    closedCounts: Math.max(extra.closedCounts, plan.inventoryCount),
    lastCount: plan.asOf,
    countDue: nextCount(plan.asOf, extra.countIntervalDays, extra.today),
    notCounted: plan.asOf ? plan.items.filter((i) => i.current === null).length : 0,
    negativePeriods: plan.items.filter((i) => i.invalidCycles > 0).length,
    // Contado na última contagem, mas o período que termina nela não entrou na média.
    negativeLatest: plan.items.filter(
      (i) => i.invalidCycles > 0 && i.current !== null && i.cycles.at(-1)?.to !== plan.asOf,
    ).length,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Notificações do que falta preencher ou conferir, cada uma com o link de onde se resolve.
 * Contagem atrasada ou aberta fica de fora: já tem notificação própria.
 */
export function setupAlerts(f: SetupFacts, { hasDraft }: { hasDraft: boolean }): Alert[] {
  const alerts: Alert[] = [];

  if (f.products === 0) {
    alerts.push({
      id: "setup-products",
      tone: "warn",
      title: "Cadastre os produtos",
      text: "Sem produtos cadastrados não há o que contar nem o que comprar.",
      href: "/produtos",
    });
    return alerts;
  }

  if (f.closedCounts === 0 && !hasDraft) {
    alerts.push({
      id: "setup-first-count",
      tone: "warn",
      title: "Faça a primeira contagem",
      text: "Ela mostra o que há no estoque hoje e é a base de todos os números.",
      href: "/inventario",
    });
  } else if (f.closedCounts === 1) {
    alerts.push({
      id: "setup-second-count",
      tone: "info",
      title: "Falta a segunda contagem",
      text: "O consumo e a compra sugerida aparecem depois da segunda contagem fechada.",
      href: "/inventario",
    });
  }

  if (f.suppliers === 0) {
    alerts.push({
      id: "setup-suppliers",
      tone: "warn",
      title: "Cadastre os fornecedores",
      text: "Com os prazos de gelado e de seco de cada fornecedor, a lista de compras sugere a quantidade certa para cada pedido.",
      href: "/fornecedores",
    });
  } else if (f.withSupplier < f.products) {
    const n = f.products - f.withSupplier;
    alerts.push({
      id: "setup-product-supplier",
      tone: "warn",
      title: plural(n, "produto sem fornecedor", "produtos sem fornecedor"),
      text: "Sem fornecedor, a compra sugerida considera entrega no mesmo dia.",
      href: "/produtos?falta=fornecedor",
    });
  }

  if (f.lastCount && f.notCounted > 0) {
    alerts.push({
      id: "setup-not-counted",
      tone: "warn",
      title: plural(f.notCounted, "produto sem contagem", "produtos sem contagem"),
      text: `${f.notCounted === 1 ? "Ficou" : "Ficaram"} fora da contagem de ${formatDate(f.lastCount)} e não ${
        f.notCounted === 1 ? "entra" : "entram"
      } na lista de compras até a próxima.`,
      href: "/inventario",
    });
  }

  if (f.negativeLatest > 0) {
    alerts.push({
      id: "setup-entries",
      tone: "warn",
      title: `Confira as entradas de ${plural(f.negativeLatest, "produto", "produtos")}`,
      text: "Na última contagem apareceu mais estoque do que havia antes, sem entrada lançada. Veja se alguma mercadoria que chegou ficou sem lançar. A lista de compras mostra quais são.",
      href: "/compras",
    });
  }

  if (f.withCost < f.products) {
    const n = f.products - f.withCost;
    alerts.push({
      id: "setup-cost",
      tone: "info",
      title: f.withCost === 0 ? "Produtos sem custo cadastrado" : plural(n, "produto sem custo", "produtos sem custo"),
      text: "Com o custo por embalagem aparecem o valor do estoque e o valor de cada compra.",
      href: "/produtos?falta=custo",
    });
  }

  return alerts;
}
