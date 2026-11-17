// Copiado de beststock/src/lib/dates.ts por scripts/copiar-do-site.mjs. Não edite aqui.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje (AAAA-MM-DD) no horário de Brasília. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function isIsoDate(value: string): boolean {
  return ISO.test(value) && !Number.isNaN(Date.parse(value));
}

/** AAAA-MM-DD -> DD/MM/AAAA */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

export function formatQty(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** "dura 3 dias", "dura 1 dia" ou "dura menos de 1 dia". */
export function coverageText(days: number): string {
  const whole = Math.floor(days);
  if (whole < 1) return "dura menos de 1 dia";
  return `dura ${formatQty(whole)} ${whole === 1 ? "dia" : "dias"}`;
}
