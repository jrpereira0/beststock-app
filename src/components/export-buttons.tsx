import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui";
import { Dialog } from "@/lib/dialog";
import { exportPdf, exportSheet, type ReportKind } from "@/lib/export";
import { hasSite } from "@/lib/site-api";

/** Baixar a planilha do Excel ou o PDF, como os botões do site. Abre o compartilhar do celular. */
export function ExportButtons({
  report,
  id,
  sheetLabel = "Baixar planilha",
  pdfLabel = "PDF",
}: {
  report: ReportKind;
  id?: string;
  sheetLabel?: string;
  pdfLabel?: string;
}) {
  const [busy, setBusy] = useState<"sheet" | "pdf" | null>(null);
  if (!hasSite) return null;
  async function run(kind: "sheet" | "pdf") {
    setBusy(kind);
    try {
      const err = await (kind === "sheet" ? exportSheet(report, id) : exportPdf(report, id));
      if (err) Dialog.alert("Não deu para gerar", err);
    } catch {
      Dialog.alert("Não deu para gerar", "Confira a internet e tente de novo.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Button label={sheetLabel} icon="grid-outline" variant="secondary" busy={busy === "sheet"} disabled={busy !== null} style={{ flex: 1, minHeight: 46 }} onPress={() => void run("sheet")} />
      <Button label={pdfLabel} icon="print-outline" variant="secondary" busy={busy === "pdf"} disabled={busy !== null} style={{ flex: 1, minHeight: 46 }} onPress={() => void run("pdf")} />
    </View>
  );
}
