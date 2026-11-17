// Copiado de beststock/src/lib/planning.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// Cálculo de consumo, curva ABC e sugestão de compra a partir dos inventários fechados.
// Arquivo sem dependências para poder ser testado direto (scripts/test-planning.mjs).
// O funcionamento completo, com exemplos, está em docs/motor-de-compras.md.

export type StorageKind = "gelado" | "seco";
export type PlanProduct = {
  id: string;
  name: string;
  category: string;
  /** Ausente conta como gelado, para os cenários antigos do cálculo. */
  storage?: StorageKind;
  count_unit: string;
  purchase_unit: string;
  units_per_purchase: number;
  cost_per_purchase: number;
  shelf_life_days: number | null;
  min_stock: number;
  supplier_id: string | null;
  active: boolean;
  /** Item que para a loja se faltar: recebe a proteção da classe A, mesmo sendo barato. */
  essential?: boolean;
};
export type PlanSupplier = {
  id: string;
  name: string;
  contact: string;
  /** Prazo dos produtos gelados. */
  lead_time_days: number;
  /** Prazo dos produtos secos. Ausente repete o prazo dos gelados. */
  lead_time_dry_days?: number;
};

/** Prazo de entrega que este produto usa no fornecedor. Sem fornecedor, a entrega é no mesmo dia. */
export function deliveryDays(product: { storage?: StorageKind }, supplier: PlanSupplier | null): number {
  if (!supplier) return 0;
  if ((product.storage ?? "gelado") === "seco") return supplier.lead_time_dry_days ?? supplier.lead_time_days;
  return supplier.lead_time_days;
}
/** Inventário fechado: produto -> quantidade contada. Produto ausente = não contado. */
export type PlanInventory = {
  counted_on: string;
  items: Record<string, number>;
  /** Dia em que o produto acabou e não voltou, quando a contagem é zero. */
  stockouts?: Record<string, string>;
};
export type PlanMovement = {
  product_id: string;
  kind: "entrada" | "perda";
  moved_on: string;
  quantity: number;
  /** Entrada lançada depois que o produto já estava contado nesse dia. */
  after_count?: boolean | null;
};
export type PlanInput = {
  products: PlanProduct[];
  suppliers: PlanSupplier[];
  inventories: PlanInventory[];
  movements: PlanMovement[];
  /** Período de contagem da loja: a cada contagem sai uma lista de compras nova. */
  countIntervalDays: number;
  /** Quantidade já pedida e ainda não recebida, por produto. */
  inTransit?: { product_id: string; quantity: number; expected_on: string }[];
  /** Data de hoje (AAAA-MM-DD). Sem ela, o motor considera que hoje é o dia da última contagem. */
  today?: string;
};

export type AbcClass = "A" | "B" | "C";
export type PlanStatus = "falta" | "comprar" | "ok" | "excesso" | "sem_dados";
export type Cycle = {
  from: string;
  to: string;
  /** Dias de calendário entre as duas contagens. */
  days: number;
  /** Dias em que havia produto na prateleira: é por eles que o consumo é dividido. */
  stockedDays: number;
  consumption: number;
  daily: number;
};
type EndedAtZero =
  | { reason: "missing" }
  | { reason: "stockout"; on: string; stocked: number }
  | { reason: "entrada" };

export type ProductPlan = {
  product: PlanProduct;
  supplier: PlanSupplier | null;
  /** Períodos entre contagens usados na média (até os 6 mais recentes). */
  cycles: Cycle[];
  /** Períodos descartados por consumo negativo (provável entrada não lançada). */
  invalidCycles: number;
  /** Períodos descartados porque o consumo destoou depois de uma contagem duvidosa. */
  outlierCycles: number;
  /** Consumo médio por dia, em unidades de contagem. Nulo sem histórico. */
  dailyAvg: number | null;
  abc: AbcClass | null;
  /** Estoque estimado hoje: última contagem + entradas − perdas − o consumo médio dos dias que passaram. */
  current: number | null;
  /** Última contagem + entradas − perdas, sem descontar o consumo desde então. */
  counted: number | null;
  /** Dias desde a última contagem. */
  daysSinceCount: number;
  coverageDays: number | null;
  /** Dias que a compra precisa cobrir: período de contagem + prazo de entrega do fornecedor. */
  horizonDays: number;
  leadDays: number;
  safety: number;
  /** Estoque que a loja precisava ter no dia da contagem para cobrir o horizonte inteiro. */
  target: number;
  /**
   * Estoque que a loja precisa ter hoje para chegar até a entrega do próximo pedido.
   * É o alvo menos o consumo dos dias que já passaram. "Precisa − tem hoje − a caminho" é a compra.
   */
  needed: number;
  /** Dias que esse estoque precisa cobrir a partir de hoje: até a próxima contagem mais a entrega. */
  coverDays: number;
  suggestedPacks: number;
  /** Quantidade pedida que ainda não chegou, em unidades de contagem. */
  inTransit: number;
  /** Pedido que parece ter chegado sem lançamento de entrada: não é descontado da compra. */
  unconfirmedTransit: number;
  /** Data prevista do próximo caminhão que ainda traz esse produto. */
  incomingOn: string | null;
  status: PlanStatus;
  notes: string[];
};
export type StockPlan = { asOf: string | null; inventoryCount: number; items: ProductPlan[] };

const DAY_MS = 86_400_000;
const MAX_CYCLES = 6;
// Nível de serviço por classe: A 95%, B 90%, C 80%.
const Z: Record<AbcClass, number> = { A: 1.65, B: 1.28, C: 0.84 };
// Folga mínima, em fração do consumo do horizonte. Vale sozinha enquanto há menos de 3 períodos
// e continua como piso depois, para a folga não cair a zero quando o consumo foi igual por acaso.
// Fica baixa de propósito: a loja quer o menor estoque possível sem deixar faltar.
const MIN_MARGIN: Record<AbcClass, number> = { A: 0.15, B: 0.1, C: 0.05 };
// Período logo depois de uma contagem duvidosa só entra na média se não passar disto vezes a mediana dos outros.
const OUTLIER_FACTOR = 2;
// Consumo abaixo desta fração do esperado, com pedido previsto para antes da contagem, indica entrega sem lançamento.
const UNLAUNCHED_FACTOR = 0.5;
const EPS = 1e-9;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const shiftDay = (iso: string, delta: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Dias com estoque de um período. `startOn` é o dia anterior ao primeiro dia com produto:
 * a contagem anterior, ou a véspera da primeira entrada quando o período começou vazio.
 * Se a contagem fechou em zero com o dia informado, os dias param nesse dia.
 */
function stockedDays(
  startOn: string,
  curOn: string,
  quantity: number,
  stockout: string | undefined,
  entradasAfter: boolean,
): { days: number; ended: EndedAtZero | null } {
  const full = Math.max(1, daysBetween(startOn, curOn));
  if (quantity !== 0) return { days: full, ended: null };
  if (!stockout || stockout <= startOn || stockout > curOn) return { days: full, ended: { reason: "missing" } };
  if (entradasAfter) return { days: full, ended: { reason: "entrada" } };
  const stocked = Math.min(full, Math.max(1, daysBetween(startOn, stockout)));
  return { days: stocked, ended: { reason: "stockout", on: stockout, stocked } };
}

type DraftCycle = Cycle & { afterInvalid: boolean };

export function buildPlan(input: PlanInput): StockPlan {
  const inventories = [...input.inventories].sort((a, b) => a.counted_on.localeCompare(b.counted_on));
  const last = inventories.at(-1) ?? null;
  const suppliers = new Map(input.suppliers.map((s) => [s.id, s]));
  // Hoje nunca fica antes da última contagem.
  const today = last && input.today && input.today > last.counted_on ? input.today : (last?.counted_on ?? null);
  const daysSinceCount = last && today ? daysBetween(last.counted_on, today) : 0;

  const movements = new Map<string, PlanMovement[]>();
  for (const m of input.movements) {
    movements.set(m.product_id, [...(movements.get(m.product_id) ?? []), m]);
  }
  const countDates = new Set(inventories.map((inv) => inv.counted_on));
  /** Entrada marcada como posterior à contagem vale no dia seguinte, só nesta conta. */
  const on = (m: PlanMovement) =>
    m.kind === "entrada" && m.after_count && countDates.has(m.moved_on) ? shiftDay(m.moved_on, 1) : m.moved_on;
  /** Entradas menos perdas depois de `after` e até `until` (inclusive). */
  const net = (productId: string, after: string, until: string | null) => {
    let total = 0;
    for (const m of movements.get(productId) ?? []) {
      const day = on(m);
      if (day > after && (until === null || day <= until)) {
        total += m.kind === "entrada" ? m.quantity : -m.quantity;
      }
    }
    return total;
  };

  const drafts = input.products
    .filter((p) => p.active)
    .map((product) => {
      const id = product.id;
      const moves = movements.get(id) ?? [];
      const counted = inventories.filter((inv) => inv.items[id] !== undefined);
      const all: DraftCycle[] = [];
      let invalidCycles = 0;
      let emptyCycles = 0;
      let endedAtZero: EndedAtZero | null = null;
      let afterInvalid = false;
      /** O último período (o que termina na última contagem) ficou negativo. */
      let lastInvalid = false;

      for (let i = 1; i < counted.length; i++) {
        const prev = counted[i - 1];
        const cur = counted[i];
        const days = daysBetween(prev.counted_on, cur.counted_on);
        if (days <= 0) continue;
        const consumption = prev.items[id] + net(id, prev.counted_on, cur.counted_on) - cur.items[id];
        if (consumption < -1e-6) {
          invalidCycles++;
          afterInvalid = true;
          if (cur === last) lastInvalid = true;
          continue;
        }

        // Período que começou com a prateleira vazia só conta a partir do dia em que chegou mercadoria.
        let startOn = prev.counted_on;
        if (prev.items[id] <= EPS) {
          const firstEntry = moves
            .filter((m) => m.kind === "entrada" && m.quantity > EPS)
            .map(on)
            .filter((day) => day > prev.counted_on && day <= cur.counted_on)
            .sort()[0];
          if (!firstEntry) {
            // Sem produto o período inteiro: não diz nada sobre a procura.
            emptyCycles++;
            afterInvalid = false;
            continue;
          }
          startOn = shiftDay(firstEntry, -1);
        }

        const stockout = cur.stockouts?.[id];
        const entradasAfter = moves.some((m) => {
          const day = on(m);
          return m.kind === "entrada" && stockout !== undefined && day > stockout && day <= cur.counted_on;
        });
        const stocked = stockedDays(startOn, cur.counted_on, cur.items[id], stockout, entradasAfter);
        if (cur === last) endedAtZero = stocked.ended;
        const c = Math.max(0, consumption);
        all.push({
          from: prev.counted_on,
          to: cur.counted_on,
          days,
          stockedDays: stocked.days,
          consumption: c,
          daily: c / stocked.days,
          afterInvalid,
        });
        afterInvalid = false;
      }

      // Contagem duvidosa (deu consumo negativo) contamina o período seguinte: um número digitado a mais
      // vira consumo enorme na semana seguinte. Se ele destoa dos outros períodos, sai da média.
      let outlierCycles = 0;
      let doubtfulCount: string | null = null;
      const trusted = all.filter((c) => !c.afterInvalid);
      const kept = all.filter((c) => {
        if (!c.afterInvalid) return true;
        if (trusted.length === 0) {
          doubtfulCount = c.from;
          return true;
        }
        if (c.daily > OUTLIER_FACTOR * median(trusted.map((t) => t.daily)) + EPS) {
          outlierCycles++;
          doubtfulCount = c.from;
          return false;
        }
        return true;
      });

      // Entrega que chegou e não foi lançada: havia pedido previsto para antes da última contagem
      // e o estoque não caiu como de costume (ou subiu). O pedido deixa de ser descontado da compra.
      const dueTransit = (input.inTransit ?? []).filter(
        (t) => t.product_id === id && t.quantity > EPS && last !== null && t.expected_on <= last.counted_on,
      );
      let unlaunched = false;
      if (dueTransit.length && last && last.items[id] !== undefined && last.items[id] > EPS) {
        const lastCycle = kept.at(-1);
        if (lastInvalid) {
          unlaunched = true;
        } else if (lastCycle && lastCycle.to === last.counted_on) {
          const others = kept.slice(0, -1);
          if (others.length) {
            const usual = median(others.map((c) => c.daily));
            if (usual > EPS && lastCycle.daily < UNLAUNCHED_FACTOR * usual) {
              unlaunched = true;
              // Esse período mediu consumo de menos: fica fora da média.
              kept.pop();
            }
          }
        }
      }

      // Período sem consumo nenhum, com produto na prateleira, num item que saiu em todos os outros
      // períodos: quase sempre é entrada que não foi lançada. Fica fora da média e vira aviso.
      let silentCycles = 0;
      const moving = kept.filter((c) => c.consumption > EPS);
      if (moving.length >= 3 && kept.length - moving.length === 1) {
        silentCycles = 1;
        kept.splice(
          kept.findIndex((c) => c.consumption <= EPS),
          1,
        );
      }

      const used = kept.slice(-MAX_CYCLES);

      // Média ponderada: o período mais recente pesa mais, e um período curto pesa menos que um longo.
      let dailyAvg: number | null = null;
      let sd: number | null = null;
      let meanStocked = 0;
      if (used.length) {
        let sum = 0;
        let weights = 0;
        used.forEach((c, i) => {
          const w = (i + 1) * c.stockedDays;
          sum += c.daily * w;
          weights += w;
        });
        dailyAvg = sum / weights;
        const totalDays = used.reduce((a, c) => a + c.stockedDays, 0);
        meanStocked = totalDays / used.length;
        if (used.length >= 3) {
          // Variação entre os períodos, com o mesmo peso por duração.
          const mean = used.reduce((a, c) => a + c.daily * c.stockedDays, 0) / totalDays;
          const variance = used.reduce((a, c) => a + c.stockedDays * (c.daily - mean) ** 2, 0) / totalDays;
          sd = Math.sqrt((variance * used.length) / (used.length - 1));
        }
      }

      const countedNow =
        last && last.items[id] !== undefined ? Math.max(0, last.items[id] + net(id, last.counted_on, null)) : null;
      return {
        product,
        cycles: used.map(
          (c): Cycle => ({
            from: c.from,
            to: c.to,
            days: c.days,
            stockedDays: c.stockedDays,
            consumption: c.consumption,
            daily: c.daily,
          }),
        ),
        invalidCycles,
        outlierCycles,
        silentCycles,
        emptyCycles,
        doubtfulCount: doubtfulCount as string | null,
        dailyAvg,
        sd,
        meanStocked,
        countedNow,
        endedAtZero,
        unlaunched,
        dueTransit,
      };
    });

  // Curva ABC pelo valor consumido por dia (ou por embalagens/dia, se nenhum custo foi informado).
  const unitCost = (p: PlanProduct) => p.cost_per_purchase / p.units_per_purchase;
  const hasCosts = drafts.some((d) => (d.dailyAvg ?? 0) > 0 && unitCost(d.product) > 0);
  const value = (d: (typeof drafts)[number]) =>
    (d.dailyAvg ?? 0) * (hasCosts ? unitCost(d.product) : 1 / d.product.units_per_purchase);
  const totalValue = drafts.reduce((a, d) => a + value(d), 0);
  const abc = new Map<string, AbcClass>();
  let cumulative = 0;
  for (const d of [...drafts].sort((a, b) => value(b) - value(a))) {
    if (d.dailyAvg === null) continue;
    const v = value(d);
    const before = totalValue > 0 ? cumulative / totalValue : 1;
    abc.set(d.product.id, v <= 0 ? "C" : before < 0.8 - EPS ? "A" : before < 0.95 - EPS ? "B" : "C");
    cumulative += v;
  }

  const items: ProductPlan[] = drafts.map((d) => {
    const { product, dailyAvg, countedNow } = d;
    const supplier = product.supplier_id ? (suppliers.get(product.supplier_id) ?? null) : null;
    const leadDays = deliveryDays(product, supplier);
    // O pedido sai depois de cada contagem: precisa durar até a próxima, mais o tempo da entrega.
    const horizonDays = input.countIntervalDays + leadDays;
    const cls = abc.get(product.id) ?? null;
    // Proteção usada na folga: item essencial é tratado como classe A.
    const service: AbcClass = product.essential ? "A" : (cls ?? "C");
    const notes: string[] = [];

    let safety = 0;
    let target = product.min_stock;
    if (dailyAvg !== null) {
      const floor = MIN_MARGIN[service] * dailyAvg * horizonDays;
      // A variação medida é a de um período inteiro (média de vários dias). Para o horizonte,
      // ela cresce com a raiz de (dias do período × dias do horizonte), e não só com a raiz do horizonte.
      const measured = d.sd !== null ? Z[service] * d.sd * Math.sqrt(d.meanStocked * horizonDays) : 0;
      safety = Math.max(floor, measured);
      target = Math.max(dailyAvg * horizonDays + safety, product.min_stock);
    } else {
      notes.push("Sem histórico de consumo: a sugestão usa o estoque mínimo cadastrado.");
    }

    if (last && countedNow !== null) {
      const arrivedAfter = (movements.get(product.id) ?? []).some(
        (m) => m.kind === "entrada" && m.after_count && m.moved_on === last.counted_on,
      );
      if (arrivedAfter) {
        notes.push(`A entrega de ${shortDate(last.counted_on)} chegou depois da contagem e entrou no estoque.`);
      }
    }
    if (d.endedAtZero?.reason === "missing") {
      notes.push("Fechou em zero e o dia em que acabou não foi informado. A média usa o período inteiro e pode estar baixa.");
    } else if (d.endedAtZero?.reason === "stockout") {
      const n = d.endedAtZero.stocked;
      notes.push(
        `Acabou em ${shortDate(d.endedAtZero.on)}. A compra usou só os ${n} ${n === 1 ? "dia" : "dias"} com estoque.`,
      );
    } else if (d.endedAtZero?.reason === "entrada") {
      notes.push("Teve entrada depois do dia informado. A média usou o período inteiro. Informe o dia em que acabou de vez.");
    }
    if (d.invalidCycles > 0) {
      notes.push(
        `${d.invalidCycles} ${d.invalidCycles === 1 ? "período teve" : "períodos tiveram"} consumo negativo e ${
          d.invalidCycles === 1 ? "foi ignorado" : "foram ignorados"
        }: confira se faltou lançar alguma entrada.`,
      );
    }
    if (d.silentCycles > 0) {
      notes.push(
        "Um período ficou sem consumo nenhum, e esse produto sai em todos os outros: ele ficou fora da média. Confira se faltou lançar uma entrada.",
      );
    }
    if (d.outlierCycles > 0 && d.doubtfulCount) {
      notes.push(
        `A contagem de ${shortDate(d.doubtfulCount)} parece ter um número errado: o consumo seguinte destoou e ficou fora da média.`,
      );
    } else if (d.doubtfulCount) {
      notes.push(
        `Confira a contagem de ${shortDate(d.doubtfulCount)}: ela veio maior do que o possível e pode ter inflado a média.`,
      );
    }
    if (product.shelf_life_days && product.shelf_life_days < horizonDays) {
      notes.push(
        `A validade de ${plural(product.shelf_life_days, "dia", "dias")} é menor que os ${horizonDays} dias que a compra precisa cobrir: vai faltar antes da próxima entrega, ou vencer.`,
      );
    }

    // Pedido a caminho. O que parece ter chegado sem lançamento sai da conta e vira aviso.
    const transit = (input.inTransit ?? []).filter(
      (t) => t.product_id === product.id && t.quantity > EPS && !(d.unlaunched && d.dueTransit.includes(t)),
    );
    const onOrder = transit.reduce((a, t) => a + t.quantity, 0);
    const incomingOn = transit.map((t) => t.expected_on).sort()[0] ?? null;
    const unconfirmedTransit = d.unlaunched ? d.dueTransit.reduce((a, t) => a + t.quantity, 0) : 0;
    if (unconfirmedTransit > 0) {
      const when = d.dueTransit.map((t) => t.expected_on).sort()[0];
      notes.push(
        `O pedido previsto para ${shortDate(when)} parece ter chegado sem lançamento: o estoque não caiu como de costume. A compra não descontou esse pedido. Lance a entrada ou cancele o pedido.`,
      );
    }

    // Prateleira estimada hoje: a contagem não se mexe sozinha, mas o consumo continua.
    const current = countedNow === null ? null : Math.max(0, countedNow - (dailyAvg ?? 0) * daysSinceCount);

    // Do dia de hoje até a próxima contagem, mais a entrega. No dia da contagem é o horizonte inteiro.
    const overdue = daysSinceCount > input.countIntervalDays;
    const coverDays = Math.max(0, input.countIntervalDays - daysSinceCount) + leadDays;
    const needed =
      dailyAvg === null ? product.min_stock : Math.max(dailyAvg * coverDays + safety, product.min_stock);

    let suggestedPacks = 0;
    let status: PlanStatus;
    let reliefDays = leadDays;
    if (current === null) {
      status = "sem_dados";
      notes.push("Não contado no último inventário: sem estoque atual para calcular.");
    } else {
      const need = needed - current - onOrder;
      if (need > EPS) suggestedPacks = Math.ceil(need / product.units_per_purchase - EPS);
      if (overdue && dailyAvg !== null) {
        notes.push(
          `A contagem está atrasada ${plural(daysSinceCount - input.countIntervalDays, "dia", "dias")}: a sugestão cobre só até a próxima entrega. Conte o estoque para a lista voltar ao normal.`,
        );
      }

      // Não sugerir mais do que dá para consumir dentro da validade (mas ao menos 1 embalagem).
      if (suggestedPacks > 0 && product.shelf_life_days && dailyAvg !== null && dailyAvg > 0) {
        const maxStock = dailyAvg * product.shelf_life_days;
        const maxPacks = Math.max(1, Math.floor((maxStock - current - onOrder) / product.units_per_purchase + EPS));
        if (maxPacks < suggestedPacks) {
          suggestedPacks = maxPacks;
          notes.push(`Quantidade limitada pela validade de ${product.shelf_life_days} dias.`);
        }
      }

      // Risco: a prateleira precisa durar até o próximo caminhão que traz esse produto.
      // Se nada está a caminho, até a entrega de um pedido feito hoje.
      reliefDays = incomingOn && today ? Math.max(0, daysBetween(today, incomingOn)) : leadDays;
      const riskSafety = horizonDays > 0 ? safety * Math.sqrt(Math.min(1, reliefDays / horizonDays)) : 0;
      if (dailyAvg === null) {
        status = suggestedPacks > 0 ? "comprar" : "sem_dados";
      } else if (dailyAvg > 0 && (current <= EPS || current < dailyAvg * reliefDays + riskSafety)) {
        status = "falta";
      } else if (suggestedPacks > 0) {
        status = "comprar";
      } else if (dailyAvg === 0 && current > 0) {
        status = "excesso";
        notes.push("Sem consumo nos últimos períodos.");
      } else if (dailyAvg > 0 && current / dailyAvg > 2 * horizonDays && current > product.min_stock) {
        status = "excesso";
      } else {
        status = "ok";
      }
    }

    // "Dura 15 dias" ao lado de "Risco de faltar" confunde. A duração usa a média; o risco, a média mais a folga.
    if (status === "falta" && dailyAvg !== null && dailyAvg > 0 && current !== null && current > EPS && current >= dailyAvg * reliefDays) {
      const lasts = Math.floor(current / dailyAvg);
      notes.push(
        `No ritmo normal dura ${plural(lasts, "dia", "dias")}, mas as vendas desse produto variam de uma semana para outra: numa semana forte ele pode acabar antes de o pedido chegar (${plural(reliefDays, "dia", "dias")}).`,
      );
    }

    return {
      product,
      supplier,
      cycles: d.cycles,
      invalidCycles: d.invalidCycles,
      outlierCycles: d.outlierCycles,
      dailyAvg,
      abc: cls,
      current,
      counted: countedNow,
      daysSinceCount,
      coverageDays: current !== null && dailyAvg !== null && dailyAvg > 0 ? current / dailyAvg : null,
      horizonDays,
      leadDays,
      safety,
      target,
      needed,
      coverDays,
      suggestedPacks,
      inTransit: onOrder,
      unconfirmedTransit,
      incomingOn,
      status,
      notes,
    };
  });

  return { asOf: last?.counted_on ?? null, inventoryCount: inventories.length, items };
}
