import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Dialog } from "@/lib/dialog";
import { exportPdf, exportSheet } from "@/lib/export";
import { hasSite } from "@/lib/site-api";
import { colors } from "@/lib/theme";

/**
 * Para quem conta no papel: a planilha do mês com os produtos na ordem da loja, para imprimir (PDF) ou
 * abrir no Excel. Abre o compartilhar do celular (imprimir, WhatsApp, e-mail, Arquivos).
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
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="document-text-outline" size={24} color={colors.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" size={18}>Prefere contar no papel?</T>
          <T size={14} color={colors.muted}>
            A planilha do mês tem os produtos na ordem da loja e espaço para as quatro semanas. Conte com caneta e depois digite aqui na contagem.
          </T>
        </View>
      </View>
      <Button label="Imprimir para contar" icon="print-outline" busy={busy === "pdf"} disabled={busy !== null} onPress={() => void run("pdf")} />
      <Button label="Baixar no Excel" icon="grid-outline" variant="secondary" busy={busy === "sheet"} disabled={busy !== null} onPress={() => void run("sheet")} />
    </Card>
  );
}
