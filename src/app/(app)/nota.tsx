import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { Button, Card, Field, Notice, T, styles as ui } from "@/components/ui";
import { DayPicker, Page } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { checkInvoice, loadInvoiceData, rememberInvoiceLinks } from "@/lib/data-entradas";
import { addDays, daysFrom, formatDate, formatQty, today } from "@/lib/dates";
import { setInvoiceDraft } from "@/lib/invoice-draft";
import { compareCategories } from "@/lib/site/category-order";
import { bestMatch, parseInvoice, type Invoice } from "@/lib/site/invoice";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Line = { productId: string; factor: string; linked: boolean };
const toNumber = (text: string) => {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Entrada pela nota fiscal (igual a entradas/nota do site): a pessoa escolhe o XML, confere qual produto da
 * loja é cada item e quantas embalagens vieram, e segue para a tela de entrada já preenchida.
 */
export default function NotaScreen() {
  const profile = useProfile();
  const load = useCallback(() => loadInvoiceData(profile), [profile]);
  const { data, fromCache, error: loadError } = useLoad(load);
  const now = today();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [date, setDate] = useState(now);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const products = useMemo(() => data?.products ?? [], [data]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const sorted = useMemo(
    () => [...products].sort((a, b) => compareCategories(a.category, b.category) || a.name.localeCompare(b.name, "pt-BR")),
    [products],
  );
  const days = useMemo(() => daysFrom(addDays(now, -13), now).reverse(), [now]);

  async function pick() {
    setError(null);
    setDuplicate(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ["text/xml", "application/xml", "*/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    let text = "";
    try {
      text = await new File(res.assets[0].uri).text();
    } catch {
      setError("Não foi possível ler o arquivo. Escolha o XML da nota de novo.");
      return;
    }
    const parsed = parseInvoice(text);
    if ("error" in parsed) {
      setInvoice(null);
      setError(parsed.error);
      return;
    }
    // Item já ligado numa nota anterior do mesmo fornecedor vem com o produto e a conversão de antes.
    const known = new Map((data?.links ?? []).filter((l) => l.issuer_id === parsed.issuerId).map((l) => [l.item_code, l]));
    setLines(
      parsed.items.map((item) => {
        const link = known.get(item.code);
        if (link && byId.has(link.product_id)) return { productId: link.product_id, factor: formatQty(link.packs_per_unit), linked: true };
        return { productId: bestMatch(item.name, products)?.id ?? "", factor: "1", linked: false };
      }),
    );
    setInvoice(parsed);
    const seen = await checkInvoice(profile, parsed.key).catch(() => null);
    if (seen) setDuplicate(seen);
  }

  const update = (index: number, patch: Partial<Line>) => setLines((all) => all.map((l, i) => (i === index ? { ...l, ...patch, linked: false } : l)));
  const packsOf = (index: number) => (invoice ? invoice.items[index].quantity * toNumber(lines[index].factor) : 0);
  const chosen = lines.filter((l) => l.productId).length;

  async function next() {
    if (!invoice) return;
    setError(null);
    const totals = new Map<string, number>();
    lines.forEach((l, i) => {
      if (l.productId) totals.set(l.productId, (totals.get(l.productId) ?? 0) + packsOf(i));
    });
    if (totals.size === 0) return setError("Escolha o produto da loja de pelo menos um item da nota.");
    if (lines.some((l) => l.productId && toNumber(l.factor) === 0)) {
      return setError("Confira as embalagens por unidade da nota: precisa ser um número maior que zero.");
    }
    setBusy(true);
    await rememberInvoiceLinks(
      profile,
      invoice.issuerId,
      invoice.items.flatMap((item, i) => (lines[i].productId && item.code ? [{ code: item.code, productId: lines[i].productId, factor: toNumber(lines[i].factor) }] : [])),
    ).catch(() => undefined);
    setBusy(false);
    setInvoiceDraft({
      date,
      quantities: Object.fromEntries([...totals].map(([id, packs]) => [id, formatQty(Math.round(packs * 1000) / 1000).replace(/\./g, "")])),
      invoice: { key: invoice.key, number: invoice.number, issuer: invoice.issuerName, issuedOn: invoice.issuedOn },
    });
    router.replace("/lancar?tipo=entrada&nota=1");
  }

  const term = search.trim().toLowerCase();
  return (
    <Page subtitle="Envie o XML da nota e a entrada vem preenchida. Depois é só conferir e salvar." fromCache={fromCache} error={loadError} loading={!data}>
      <Stack.Screen options={{ title: "Entrada pela nota" }} />
      <Card style={{ gap: 10 }}>
        <T weight="semibold">Arquivo XML da nota fiscal</T>
        <Button label={invoice ? "Escolher outra nota" : "Escolher o arquivo XML"} variant={invoice ? "secondary" : "primary"} onPress={() => void pick()} />
        <T size={14} color={colors.muted}>
          É o arquivo .xml que o fornecedor manda por e-mail junto com o DANFE. Salve o anexo no celular e escolha aqui. Na primeira nota você confere cada produto; nas próximas do mesmo fornecedor, eles já vêm escolhidos.
        </T>
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      {invoice && (
        <>
          <Notice title={`Nota ${invoice.number} · ${invoice.issuerName}`} tone={duplicate ? "warn" : "info"}>
            {duplicate
              ? `Esta nota já foi lançada ${duplicate}. Lançar de novo duplicaria a entrada.`
              : `Emitida em ${invoice.issuedOn ? formatDate(invoice.issuedOn) : "—"}, com ${invoice.items.length} ${invoice.items.length === 1 ? "produto" : "produtos"}. Confira qual produto da loja é cada item e quantas embalagens vieram.`}
          </Notice>
          {!duplicate && (
            <>
              <Card style={{ gap: 8 }}>
                <T weight="semibold">Dia em que a mercadoria chegou</T>
                <DayPicker value={date} onChange={setDate} days={days} todayIso={now} />
              </Card>
              {invoice.items.map((item, i) => {
                const line = lines[i];
                const product = byId.get(line.productId);
                return (
                  <Card key={i} style={{ gap: 10 }}>
                    <View>
                      <T weight="semibold">{item.name}</T>
                      <T size={14} color={colors.muted}>
                        {formatQty(item.quantity)} {item.unit}
                        {item.code ? ` · código ${item.code}` : ""}
                      </T>
                    </View>
                    <T weight="semibold">Produto da loja</T>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setSearch("");
                        setPicking(i);
                      }}
                      style={[ui.input, { justifyContent: "center" }]}
                    >
                      <T color={product ? colors.ink : colors.muted}>{product ? product.name : "Não lançar este item"}</T>
                    </Pressable>
                    {line.linked && <T size={14} color={colors.muted}>Escolhido pela nota anterior deste fornecedor</T>}
                    {product && (
                      <>
                        <Field
                          label={`${product.purchase_unit} por ${item.unit || "unidade"} da nota`}
                          value={line.factor}
                          onChangeText={(v) => update(i, { factor: v, productId: line.productId })}
                          keyboardType="decimal-pad"
                        />
                        <T weight="semibold" size={15}>
                          Entram {formatQty(Math.round(packsOf(i) * 1000) / 1000)} {product.purchase_unit}
                        </T>
                      </>
                    )}
                  </Card>
                );
              })}
              <T size={14} weight="semibold" color={colors.muted}>
                {chosen} de {invoice.items.length} {invoice.items.length === 1 ? "item ligado" : "itens ligados"} a um produto da loja
              </T>
              <Button label={busy ? "Abrindo…" : "Conferir a entrada"} busy={busy} onPress={() => void next()} />
            </>
          )}
        </>
      )}

      <Modal visible={picking !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
        <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 }}>
          <T weight="extrabold" size={20}>Produto da loja</T>
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar produto" placeholderTextColor={colors.muted} style={ui.input} autoFocus />
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {[{ id: "", name: "Não lançar este item", category: "" }, ...sorted]
              .filter((p) => !term || p.id === "" || p.name.toLowerCase().includes(term))
              .map((p) => (
                <Pressable
                  key={p.id || "nenhum"}
                  accessibilityRole="button"
                  onPress={() => {
                    if (picking !== null) update(picking, { productId: p.id });
                    setPicking(null);
                  }}
                  style={[ui.card, { paddingVertical: 12 }]}
                >
                  <T weight="semibold">{p.name}</T>
                  {p.category ? <T size={14} color={colors.muted}>{p.category}</T> : null}
                </Pressable>
              ))}
          </ScrollView>
          <Button label="Fechar" variant="secondary" onPress={() => setPicking(null)} />
        </View>
      </Modal>
    </Page>
  );
}
