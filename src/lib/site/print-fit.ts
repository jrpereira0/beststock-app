// Copiado de beststock/src/lib/print-fit.ts por scripts/copiar-do-site.mjs. Não edite aqui.
// Folhas certas na planilha em branco: escolhe o número de folhas A4 e a altura das linhas para os produtos
// encherem as folhas por igual, sem uma última folha com dois ou três produtos. Sem dependências: o site
// (imprimir e Excel) e o app (PDF e Excel) usam a mesma conta.

/** Medidas da folha impressa, em milímetros (A4 em pé, margens de 10 mm). */
export const PRINT = {
  pageHeight: 277,
  /** Título, loja e a linha embaixo, só na primeira folha. */
  header: 20,
  /** Cabeçalho da tabela, que se repete no alto de cada folha. */
  thead: 8,
  /** Título de cada tipo (AÇAÍ, SORVETES...). */
  group: 8,
  /** "Gerado pelo BestStock", na última folha. */
  footer: 8,
  /** Folga por folha: uma linha e um título de tipo não se partem entre duas folhas. */
  slack: 14,
  /** Linha mais baixa que ainda dá para escrever à mão, e a mais alta que vale a pena. */
  minRow: 6.5,
  maxRow: 11,
} as const;

/** Quantas folhas e qual altura de linha (mm) para `rows` produtos em `groups` tipos. */
export function fitBlankSheet(rows: number, groups: number): { pages: number; rowMm: number } {
  const p = PRINT;
  const fixed = p.header + p.footer + groups * p.group;
  const perPage = p.pageHeight - p.thead - p.slack;
  if (rows <= 0) return { pages: 1, rowMm: p.maxRow };
  // O menor número de folhas em que tudo cabe com a linha mais baixa.
  let pages = 1;
  while (pages * perPage < fixed + rows * p.minRow) pages++;
  // Com esse número de folhas, a linha cresce até encher as folhas por igual (sem passar da mais alta).
  const rowMm = Math.min(p.maxRow, (pages * perPage - fixed) / rows);
  return { pages, rowMm: Math.floor(rowMm * 10) / 10 };
}

/** Milímetros em pontos (o Excel mede a altura das linhas em pontos). */
export const mmToPt = (mm: number) => Math.round(((mm * 72) / 25.4) * 10) / 10;
