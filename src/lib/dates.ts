// Mesmas contas de data do site (src/lib/dates.ts), para o app e o site concordarem.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje (AAAA-MM-DD) no horário de Brasília. */
export function today(now: Date = new Date()): string {
  try {
    const text = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (ISO.test(text)) return text;
  } catch {
    // Aparelho sem fuso horário completo: cai na conta fixa abaixo.
  }
  // Brasília não tem horário de verão desde 2019: UTC−3.
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return ISO.test(value) && !Number.isNaN(Date.parse(value));
}

/** AAAA-MM-DD -> DD/MM/AAAA */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** AAAA-MM-DD -> DD/MM */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function weekday(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dias de `from` até `to` (negativo se `to` já passou). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Todos os dias de `from` até `to`, inclusive. */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 1234,5 -> "1.234,5" (formato brasileiro, até 3 casas). */
export function formatQty(n: number): string {
  const fixed = Math.round(n * 1000) / 1000;
  const [int, dec] = Math.abs(fixed).toString().split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${fixed < 0 ? "-" : ""}${grouped}${dec ? `,${dec}` : ""}`;
}

export type CountDue = { text: string; overdue: boolean; dueToday: boolean };

/** Quando é a próxima contagem, a partir da última fechada e do período da loja (igual ao site). */
export function nextCount(lastClosedOn: string | null, intervalDays: number, now: string): CountDue | null {
  if (!lastClosedOn) return null;
  const due = addDays(lastClosedOn, intervalDays);
  const diff = daysBetween(now, due);
  if (diff > 1) return { text: `Próxima contagem em ${formatDate(due)}, daqui a ${diff} dias.`, overdue: false, dueToday: false };
  if (diff === 1) return { text: `Próxima contagem amanhã, ${formatDate(due)}.`, overdue: false, dueToday: false };
  if (diff === 0) return { text: "Hoje é dia de contagem.", overdue: false, dueToday: true };
  return {
    text: `A contagem está atrasada ${-diff} ${diff === -1 ? "dia" : "dias"} (era para ${formatDate(due)}).`,
    overdue: true,
    dueToday: false,
  };
}
