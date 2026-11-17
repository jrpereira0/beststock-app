// A tela da nota fiscal monta a entrada e passa para a tela de lançar já preenchida (no site isso vai pelo endereço).
export type InvoiceInfo = { key: string; number: string; issuer: string; issuedOn: string };
export type InvoiceDraft = { date: string; quantities: Record<string, string>; invoice: InvoiceInfo };

let draft: InvoiceDraft | null = null;

export function setInvoiceDraft(next: InvoiceDraft) {
  draft = next;
}

/** Entrega o rascunho uma vez só: voltar e abrir "Registrar entrada" de novo começa em branco. */
export function takeInvoiceDraft(): InvoiceDraft | null {
  const current = draft;
  draft = null;
  return current;
}
