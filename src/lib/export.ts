// Exportar planilha do Excel e PDF, como os botões do site (/exportar e /imprimir). O relatório vem do site
// (rota api/app/relatorio, mesmas consultas de lib/reports.ts); a planilha sai do mesmo gerador do site
// (src/lib/site/xlsx.ts) e o PDF, do mesmo layout da página de imprimir. Depois, o celular abre o
// compartilhar (WhatsApp, e-mail, Arquivos, imprimir).
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { callSite } from "./site-api";
import { reportHtml } from "./report-html.ts";
import { orientationOf, toXlsx, type Report } from "./site/xlsx";

export type ReportKind = "contagem" | "modelo" | "consumo" | "compras";

async function fetchReport(kind: ReportKind, id?: string): Promise<Report | string> {
  const res = await callSite<{ report: Report }>(`/api/app/relatorio/${kind}${id ? `?id=${encodeURIComponent(id)}` : ""}`);
  return res.ok ? res.data.report : res.error;
}

/** Arquivo novo no cache do app, com o nome do relatório (o mesmo do site). */
function cacheFile(name: string): File {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  return file;
}

export async function exportSheet(kind: ReportKind, id?: string): Promise<string | null> {
  const report = await fetchReport(kind, id);
  if (typeof report === "string") return report;
  const file = cacheFile(`${report.filename}.xlsx`);
  file.write(toXlsx(report));
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    UTI: "org.openxmlformats.spreadsheetml.sheet",
    dialogTitle: report.title,
  });
  return null;
}

export async function exportPdf(kind: ReportKind, id?: string): Promise<string | null> {
  const report = await fetchReport(kind, id);
  if (typeof report === "string") return report;
  const landscape = orientationOf(report) === "landscape";
  // A4 em pontos (72 por polegada): em pé 595 × 842, deitada 842 × 595, como a página de imprimir do site.
  const { uri } = await Print.printToFileAsync({ html: reportHtml(report, kind === "modelo"), width: landscape ? 842 : 595, height: landscape ? 595 : 842 });
  const file = cacheFile(`${report.filename}.pdf`);
  new File(uri).move(file);
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: report.title });
  return null;
}

