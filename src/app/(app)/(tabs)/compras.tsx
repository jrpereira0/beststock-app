import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert as Dialog, Linking, Pressable, View } from "react-native";
import { Button, Card, Notice, QuantityStepper, T } from "@/components/ui";
import { Badge, Page, Stat } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { cancelPurchaseOrder, loadPurchases, registerPurchaseOrder } from "@/lib/data-compras";
import { daysBetween, formatDate, formatQty, today } from "@/lib/dates";
import { orderText, parsePacks, purchaseGroups, roundUp, type PurchaseGroup, type PurchaseRow } from "@/lib/purchases";
import { brl } from "@/lib/site/billing";
import { coverageText } from "@/lib/site/dates";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Filter = "todos" | "risco" | "repor";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ComprasTab() {
  const profile = useProfile();
  const load = useCallback(() => loadPurchases(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(load);
  const plan = data?.plan;
  const groups = useMemo(() => (plan ? purchaseGroups(plan, profile.store.count_interval_days) : []), [plan, profile.store.count_interval_days]);

  // A quantidade de comprar começa na sugestão e volta para ela quando a lista muda (pedido registrado ou cancelado).
  const planKey = groups.map((g) => g.rows.map((r) => `${r.id}:${r.packs}:${r.inTransit}`).join(",")).join(";");
  const [packs, setPacks] = useState<Record<string, string>>({});
  const [seenKey, setSeenKey] = useState("");
  if (planKey !== seenKey) {
    setSeenKey(planKey);
    setPacks(Object.fromEntries(groups.flatMap((g) => g.rows.map((r) => [r.id, String(r.packs).replace(".", ",")]))));
  }
  const [filter, setFilter] = useState<Filter>("todos");
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const qty = (r: PurchaseRow) => parsePacks(packs[r.id] ?? "");
  const rows = groups.flatMap((g) => g.rows);
  const groupTotal = (g: PurchaseGroup) => g.rows.reduce((a, r) => a + qty(r) * r.costPerPurchase, 0);
  const total = groups.reduce((a, g) => a + groupTotal(g), 0);
  const itemCount = rows.filter((r) => qty(r) > 0).length;
  const riskCount = rows.filter((r) => r.risk).length;
  const visible = (r: PurchaseRow) => filter === "todos" || (filter === "risco") === r.risk;
  const textOf = (g: PurchaseGroup) => orderText(profile.store.name, g.rows.map((r) => ({ name: r.name, purchaseUnit: r.purchaseUnit, packs: qty(r) })));

  // Copiar ou abrir o WhatsApp não registra nada: o pedido só conta como a caminho quando a pessoa confirma que enviou.
  async function copy(g: PurchaseGroup) {
    await Clipboard.setStringAsync(textOf(g));
    setAwaiting(g.key);
    Dialog.alert("Pedido copiado", "Cole na conversa com o fornecedor.");
  }
  async function whatsapp(g: PurchaseGroup) {
    const url = `https://wa.me/?text=${encodeURIComponent(textOf(g))}`;
    try {
      await Linking.openURL(url);
    } catch {
      await Clipboard.setStringAsync(textOf(g));
      Dialog.alert("Não abriu o WhatsApp", "O pedido foi copiado. Cole na conversa com o fornecedor.");
    }
    setAwaiting(g.key);
  }
  async function confirmSent(g: PurchaseGroup) {
    const lines = g.rows.filter((r) => qty(r) > 0).map((r) => ({ productId: r.id, packs: qty(r) }));
    setBusy(g.key);
    const err = await registerPurchaseOrder(profile, { supplierId: g.supplierId, storage: g.storage, lines });
    setBusy(null);
    if (err) return Dialog.alert("Não registrou o pedido", err);
    setAwaiting(null);
    void reload();
  }
  function cancel(id: string) {
    Dialog.alert("Cancelar este pedido?", "O que ainda não chegou deixa de contar como a caminho. O que já entrou no estoque permanece.", [
      { text: "Voltar", style: "cancel" },
      {
        text: "Cancelar pedido",
        style: "destructive",
        onPress: async () => {
          const err = await cancelPurchaseOrder(profile, id);
          if (err) Dialog.alert("Não cancelou", err);
          else void reload();
        },
      },
    ]);
  }

  const now = today();
  const withoutHistory = plan?.items.filter((i) => i.dailyAvg === null).length ?? 0;
  const noMinimum = plan?.items.filter((i) => i.current !== null && !(i.product.min_stock > 0)).length ?? 0;
  const toCheck = plan?.items.filter((i) => i.invalidCycles > 0 || (i.current === null && i.cycles.length > 0)) ?? [];

  return (
    <Page
      tab
      title="Lista de compras"
      subtitle={plan?.asOf ? `Calculada pela contagem de ${formatDate(plan.asOf)}, mais as entradas e perdas lançadas depois.` : undefined}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      skeleton="dashboard"
      loading={!data}
    >
      <Button label="Registrar pedido que já fiz" variant="secondary" onPress={() => router.push("/pedido")} />
      {plan && !plan.asOf && (
        <Card style={{ gap: 6 }}>
          <T weight="bold">Ainda não há lista</T>
          <T color={colors.muted}>
            A lista de compras aparece depois que você fecha a primeira contagem do estoque. Se você já fez um pedido, dá para registrá-lo agora, antes de contar.
          </T>
          <Button label="Ir para o inventário" onPress={() => router.navigate("/inventario")} />
        </Card>
      )}
      {plan?.asOf && (
        <>
          {plan.inventoryCount < 2 && (
            <Notice title="Primeira contagem: a lista usa o estoque mínimo">
              {`Com uma só contagem ainda não dá para saber quanto sai por semana. Por isso a lista repõe o estoque mínimo que você cadastrou em cada produto${
                noMinimum > 0 ? `, e ${noMinimum} ${noMinimum === 1 ? "produto sem mínimo fica" : "produtos sem mínimo ficam"} de fora` : ""
              }. Se você já fez um pedido, registre-o para a lista não pedir de novo o que está a caminho. Na segunda contagem o sistema passa a usar o consumo real, contando o que chegou.`}
            </Notice>
          )}
          {plan.inventoryCount >= 2 && withoutHistory > 0 && (
            <Notice>
              {`${withoutHistory} ${withoutHistory === 1 ? "produto ainda não tem" : "produtos ainda não têm"} média de consumo, porque precisam de duas contagens. Para eles vale o estoque mínimo cadastrado.`}
            </Notice>
          )}
          {toCheck.length > 0 && (
            <Notice tone="warn" title={`${toCheck.length} ${toCheck.length === 1 ? "produto para conferir" : "produtos para conferir"}`}>
              {toCheck.map((i) => (
                <T key={i.product.id} size={15}>
                  <T size={15} weight="semibold">{i.product.name}:</T> {i.notes.join(" ")}
                </T>
              ))}
            </Notice>
          )}
          <Notice>Depois de copiar ou enviar, confirme que o pedido saiu. A lista passa a descontar o que está a caminho e só pede de novo o que ainda falta.</Notice>

          {data && data.openOrders.length > 0 && (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {data.openOrders.map((o, i) => {
                const late = o.expected_on < now;
                return (
                  <View key={o.id} style={{ padding: 14, gap: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.line }}>
                    <T weight="bold">{o.kind} · {o.who}</T>
                    <T size={14} weight={late ? "semibold" : "regular"} color={late ? colors.danger : colors.muted}>
                      {`Enviado em ${formatDate(o.ordered_on)} · previsto para ${formatDate(o.expected_on)}${o.products > 0 ? ` · ${plural(o.products, "produto", "produtos")}` : ""}${late ? " · ainda não chegou" : ""}`}
                    </T>
                    <Button label="Cancelar pedido" variant="secondary" style={{ minHeight: 44 }} onPress={() => cancel(o.id)} />
                  </View>
                );
              })}
            </Card>
          )}

          {groups.length === 0 ? (
            <Card style={{ gap: 6 }}>
              {plan.inventoryCount < 2 && noMinimum > 0 ? (
                <>
                  <T weight="bold">Nenhum produto pede compra ainda</T>
                  <T color={colors.muted}>
                    {`Na primeira contagem a lista só sugere produtos que têm estoque mínimo e estão abaixo dele. ${noMinimum} ${noMinimum === 1 ? "produto está" : "produtos estão"} sem mínimo. Defina o mínimo de quem você quer ver aqui, ou registre o pedido que você já fez.`}
                  </T>
                  <Button label="Definir estoque mínimo" onPress={() => router.push("/produtos")} />
                </>
              ) : (
                <>
                  <T weight="bold">Nada para comprar agora</T>
                  <T color={colors.muted}>O estoque atual, somado ao que já está a caminho, cobre o período até a próxima compra.</T>
                </>
              )}
            </Card>
          ) : (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Stat label="Para comprar" value={plural(itemCount, "produto", "produtos")} />
                <Stat
                  label="Risco de faltar"
                  value={riskCount}
                  tone={riskCount > 0 ? "danger" : "neutral"}
                  hint={riskCount > 0 ? "Podem acabar antes de a compra chegar" : "Nenhum produto em risco"}
                />
                <Stat label="Valor estimado" value={total > 0 ? brl.format(total) : "—"} hint={total > 0 ? undefined : "Cadastre o custo dos produtos para ver"} />
                <Stat
                  label="Contagem usada"
                  value={formatDate(plan.asOf)}
                  hint={daysBetween(plan.asOf, now) <= 0 ? "Feita hoje" : `Há ${plural(daysBetween(plan.asOf, now), "dia", "dias")}`}
                />
              </View>
              <T size={14} color={colors.muted}>
                Tem hoje: estimativa pela última contagem, entradas e perdas. Precisa: o estoque para chegar até a próxima compra ser entregue, com margem. Comprar: o que falta depois do que já está a caminho; mude o número se quiser pedir diferente.
              </T>
              {riskCount > 0 && riskCount < rows.length && (
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {(
                    [
                      ["todos", "Tudo", rows.length],
                      ["risco", "Risco de faltar", riskCount],
                      ["repor", "Só repor", rows.length - riskCount],
                    ] as const
                  ).map(([key, label, count]) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: filter === key }}
                      onPress={() => setFilter(key)}
                      style={{
                        minHeight: 40,
                        paddingHorizontal: 14,
                        borderRadius: 20,
                        justifyContent: "center",
                        backgroundColor: filter === key ? colors.ink : colors.card,
                        borderWidth: 1,
                        borderColor: filter === key ? colors.ink : colors.line,
                      }}
                    >
                      <T weight="semibold" size={15} color={filter === key ? "#fff" : colors.ink}>{`${label} ${count}`}</T>
                    </Pressable>
                  ))}
                </View>
              )}
              {groups.map((g) => {
                const shown = g.rows.filter(visible);
                if (shown.length === 0) return null;
                const count = g.rows.filter((r) => qty(r) > 0).length;
                const empty = count === 0;
                return (
                  <Card key={g.key} style={{ padding: 0, overflow: "hidden" }}>
                    <View style={{ backgroundColor: colors.bg, padding: 14, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                      <T weight="extrabold" size={18}>{g.supplier}</T>
                      <T size={14} color={colors.muted}>{g.detail}</T>
                      <T size={14} weight="bold">
                        {plural(count, "produto", "produtos")}
                        {groupTotal(g) > 0 ? ` · ${brl.format(groupTotal(g))}` : ""}
                      </T>
                    </View>
                    {awaiting === g.key && (
                      <View style={{ backgroundColor: colors.brandSoft, padding: 14, gap: 8 }} accessibilityLiveRegion="polite">
                        <T weight="bold">Você enviou este pedido ao fornecedor?</T>
                        <T size={14} color={colors.muted}>
                          Ao confirmar, o sistema guarda o pedido como a caminho e para de sugerir esses produtos até a entrada chegar.
                        </T>
                        <Button label={busy === g.key ? "Registrando…" : "Sim, já enviei"} variant="dark" busy={busy === g.key} onPress={() => void confirmSent(g)} />
                        <Button label="Ainda não" variant="secondary" disabled={busy === g.key} onPress={() => setAwaiting(null)} />
                      </View>
                    )}
                    {shown.map((r) => {
                      const cover = r.coverageDays !== null ? Math.min(100, Math.max(4, (r.coverageDays / g.horizonDays) * 100)) : null;
                      const lineValue = qty(r) * r.costPerPurchase;
                      return (
                        <View key={r.id} style={{ padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, opacity: qty(r) === 0 ? 0.6 : 1 }}>
                          <View style={{ gap: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <T weight="semibold">{r.name}</T>
                              {r.risk && <Badge tone="danger">Risco de faltar</Badge>}
                            </View>
                            {r.category ? <T size={14} color={colors.muted}>{r.category}</T> : null}
                            {r.notes.map((n) => (
                              <T key={n} size={14} color={colors.muted}>{n}</T>
                            ))}
                          </View>
                          <View style={{ flexDirection: "row", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <T size={12} weight="semibold" color={colors.muted}>Tem hoje</T>
                              <T weight="bold">{formatQty(r.current)} <T size={13} color={colors.muted}>{r.countUnit}</T></T>
                              {r.inTransit > 0 && <T size={12} weight="semibold" color={colors.brandText}>{formatQty(r.inTransit)} a caminho</T>}
                              {cover !== null && r.coverageDays !== null && (
                                <>
                                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden", marginTop: 4 }}>
                                    <View style={{ height: "100%", width: `${cover}%`, backgroundColor: r.risk ? colors.danger : colors.brand }} />
                                  </View>
                                  <T size={12} weight="semibold" color={r.risk ? colors.danger : colors.muted}>{coverageText(r.coverageDays)}</T>
                                </>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <T size={12} weight="semibold" color={colors.muted}>Sai por semana</T>
                              {r.weekly !== null ? (
                                <T weight="bold">{formatQty(Number(r.weekly.toFixed(1)))} <T size={13} color={colors.muted}>{r.countUnit}</T></T>
                              ) : (
                                <T size={14} color={colors.muted}>Sem média ainda</T>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <T size={12} weight="semibold" color={colors.muted}>Precisa ({g.horizonDays} d)</T>
                              <T weight="bold">{formatQty(roundUp(r.target))} <T size={13} color={colors.muted}>{r.countUnit}</T></T>
                              {r.byMinimum && <T size={12} weight="semibold" color={colors.muted}>estoque mínimo</T>}
                            </View>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                            <View style={{ flexShrink: 1 }}>
                              <T weight="bold">Comprar</T>
                              <T size={13} color={colors.muted}>
                                {r.perPack !== 1 ? `${r.purchaseUnit} de ${formatQty(r.perPack)} ${r.countUnit}` : r.purchaseUnit}
                                {lineValue > 0 ? ` · ${brl.format(lineValue)}` : ""}
                              </T>
                            </View>
                            <QuantityStepper label={r.name} value={packs[r.id] ?? ""} onChange={(t) => setPacks((p) => ({ ...p, [r.id]: t }))} />
                          </View>
                        </View>
                      );
                    })}
                    <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                      <Button label="Copiar pedido" variant="secondary" disabled={empty} onPress={() => void copy(g)} />
                      <Button label="Enviar por WhatsApp" variant="secondary" disabled={empty} onPress={() => void whatsapp(g)} />
                    </View>
                  </Card>
                );
              })}
            </>
          )}
        </>
      )}
    </Page>
  );
}
