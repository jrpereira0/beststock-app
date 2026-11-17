// Copiado de beststock/src/lib/billing.ts por scripts/copiar-do-site.mjs. Não edite aqui.
import { daysBetween, formatDate } from "./dates";
import type { Payment, PaymentMethod, Plan } from "./types";

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
};
export const isPaymentMethod = (v: string): v is PaymentMethod => v in PAYMENT_METHODS;

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Unidade ativa que entra no sistema, mas não gera cobrança de plano. */
export function semCobranca(store: { active: boolean; billing_active: boolean }): boolean {
  return store.active && !store.billing_active;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-11-01" -> "nov/2026" */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]}/${y}`;
}

const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-11" ou "2026-11-01" -> "novembro de 2026" */
export function monthLong(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MONTHS_LONG[Number(m) - 1]} de ${y}`;
}

/** Primeiro dia do mês de uma data AAAA-MM-DD (ou de um AAAA-MM). */
export const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Soma meses a um AAAA-MM. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Data de vencimento de um mês (AAAA-MM) para um dia de vencimento. */
export const dueDateOf = (ym: string, dueDay: number) => `${ym}-${String(dueDay).padStart(2, "0")}`;

/**
 * Mês da primeira cobrança quando o administrador escolhe "próximo vencimento":
 * o mês atual, se o dia de vencimento ainda não passou; senão, o mês seguinte.
 * Assim a primeira cobrança nunca nasce atrasada.
 */
export function firstBillingMonth(today: string, dueDay: number): string {
  const ym = today.slice(0, 7);
  return Number(today.slice(8, 10)) <= dueDay ? ym : addMonths(ym, 1);
}

/** "por mês", "por ano" ou "a cada 3 meses" */
export function periodText(months: number): string {
  if (months === 1) return "por mês";
  if (months === 12) return "por ano";
  return `a cada ${months} meses`;
}

/** "Plano Anual"; não repete a palavra quando o nome já começa com ela. */
export const planTitle = (name: string) => (/^plano\b/i.test(name) ? name : `Plano ${name}`);

/** "R$ 150,00 por mês" */
export const planPrice = (plan: Pick<Plan, "price" | "duration_months">) =>
  `${brl.format(Number(plan.price))} ${periodText(plan.duration_months)}`;

/** "Mensal", "Trimestral", "Anual"… ou "A cada 5 meses". */
export function durationName(months: number): string {
  const names: Record<number, string> = { 1: "Mensal", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };
  return names[months] ?? `A cada ${months} meses`;
}

/**
 * Mês (AAAA-MM) da primeira cobrança ao ligar, religar ou trocar de plano. Nunca cai no passado
 * nem dentro de um período já cobrado (`chargedUntil` é o primeiro mês livre, ou nulo).
 */
export function firstChargeMonth(wanted: string, chargedUntil: string | null, thisMonth: string): string {
  const month = chargedUntil && chargedUntil > wanted ? chargedUntil : wanted;
  return month < thisMonth ? thisMonth : month;
}

/**
 * Vencimentos das próximas cobranças de um ciclo que começa em `start` e se repete a cada
 * `months` meses, contando do mês `from` (AAAA-MM) em diante.
 */
export function cycleDueDates(start: string, months: number, dueDay: number, from: string, count: number): string[] {
  let ym = start.slice(0, 7);
  if (ym < from) {
    const [sy, sm] = ym.split("-").map(Number);
    const [fy, fm] = from.split("-").map(Number);
    const elapsed = fy * 12 + fm - (sy * 12 + sm);
    ym = addMonths(ym, Math.ceil(elapsed / months) * months);
  }
  return Array.from({ length: count }, (_, i) => dueDateOf(addMonths(ym, i * months), dueDay));
}

/** Vencimento da próxima cobrança do plano que ainda vai ser gerada. */
export function nextChargeDate(
  store: { billing_active: boolean; billing_start: string | null; due_day: number },
  plan: Pick<Plan, "duration_months"> | null | undefined,
  today: string,
) {
  if (!store.billing_active || !store.billing_start || !plan) return null;
  const start = store.billing_start.slice(0, 7);
  const now = today.slice(0, 7);
  // A cobrança do mês atual já foi gerada: a próxima é a do período seguinte.
  const from = start > now ? start : addMonths(now, 1);
  return cycleDueDates(start, plan.duration_months, store.due_day, from, 1)[0];
}

/** Dias que as unidades veem como "vence em breve". */
export const DUE_SOON_DAYS = 5;

export type PaymentSituation = "pago" | "cancelado" | "atrasado" | "vence_logo" | "em_aberto";

/** Situação da cobrança hoje. "Atrasado" não é gravado: é a cobrança pendente com vencimento passado. */
export function situation(p: Pick<Payment, "status" | "due_date">, today: string): PaymentSituation {
  if (p.status === "pago") return "pago";
  if (p.status === "cancelado") return "cancelado";
  const days = daysBetween(today, p.due_date);
  if (days < 0) return "atrasado";
  return days <= DUE_SOON_DAYS ? "vence_logo" : "em_aberto";
}

export const SITUATION_LABEL: Record<PaymentSituation, { text: string; tone: "ok" | "off" | "warn" | "danger" | "info" }> = {
  pago: { text: "Pago", tone: "ok" },
  cancelado: { text: "Cancelado", tone: "off" },
  atrasado: { text: "Atrasado", tone: "danger" },
  vence_logo: { text: "Vence em breve", tone: "warn" },
  em_aberto: { text: "Em aberto", tone: "info" },
};

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias" */
export function dueText(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  if (days > 1) return `vence em ${days} dias, ${formatDate(dueDate)}`;
  return `venceu há ${-days} ${days === -1 ? "dia" : "dias"}, em ${formatDate(dueDate)}`;
}
