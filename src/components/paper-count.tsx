import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui";
import { Dialog } from "@/lib/dialog";
import { exportPdf, exportSheet } from "@/lib/export";
import { hasSite } from "@/lib/site-api";

/**
 * Para quem conta no papel: a planilha do mês com os produtos na ordem da loja, para imprimir (PDF) ou
 * abrir no Excel. Fica no alto da tela do inventário. Abre o compartilhar do celular (imprimir, WhatsApp, e-mail, Arquivos).
 */
export function PaperCount() {
  const [busy, setBusy] = useState<"pdf" | "sheet" | null>(null);
  if (!hasSite) return null;
  async function run(kind: "pdf" | "sheet") {
    setBusy(kind);
    try {
      const err = await (kind === "pdf" ? exportPdf("modelo") : exportSheet("modelo"));
      if (err) Dialog.alert("Não deu para gerar", err);
    } catch {
      Dialog.alert("Não deu para gerar", "Confira a internet e tente de novo.");
    } finally {
      setBusy(null);
    }
  }
  // No alto da tela do inventário, lado a lado: imprimir (PDF) e a planilha do Excel.
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Button label="Imprimir" icon="print-outline" variant="secondary" busy={busy === "pdf"} disabled={busy !== null} onPress={() => void run("pdf")} style={{ flex: 1 }} />
      <Button label="Planilha" icon="grid-outline" variant="secondary" busy={busy === "sheet"} disabled={busy !== null} onPress={() => void run("sheet")} style={{ flex: 1 }} />
    </View>
  );
}