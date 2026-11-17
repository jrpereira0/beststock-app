// Copiado de beststock/src/lib/inventory-status.ts por scripts/copiar-do-site.mjs. Não edite aqui.
import { addDays, daysBetween, formatDate } from "./dates";

export type CountDue = { text: string; overdue: boolean; dueToday: boolean };

/** Quando é a próxima contagem, a partir da última fechada e do período da loja. */
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
