import { router, Stack } from "expo-router";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Button, Card, T, styles as ui } from "@/components/ui";
import { Badge, Page, Stat } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { normalize } from "@/lib/count-rules";
import { cached } from "@/lib/data";
import { computePlan } from "@/lib/data-compras";
import { formatDate, formatQty } from "@/lib/dates";
import { brl } from "@/lib/site/billing";
import { coverageText } from "@/lib/site/dates";
import type { AbcClass, PlanStatus, ProductPlan } from "@/lib/site/planning";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const STATUS: Record<PlanStatus, { text: string; tone: "danger" | "warn" | "ok" | "info" | "off" }> = {
  falta: { text: "Risco de faltar", tone: "danger" },
  comprar: { text: "Comprar", tone: "warn" },
  ok: { text: "Em dia", tone: "ok" },
  excesso: { text: "Em excesso", tone: "info" },
  sem_dados: { text: "Sem dados", tone: "off" },
};
const STATUS_ORDER: PlanStatus[] = ["falta", "comprar", "ok", "excesso", "sem_dados"];
const CLASSES: AbcClass[] = ["A", "B", "C"];
const CLASS_COLOR: Record<AbcClass, { bg: string; fg: string }> = {
  A: { bg: colors.ink, fg: "#fff" },
  B: { bg: colors.brand, fg: colors.ink },
  C: { bg: colors.line, fg: colors.ink },
};
const unitCost = (i: ProductPlan) => i.product.cost_per_purchase / i.product.units_per_purchase;
const weeklyValue = (i: ProductPlan) => (i.dailyAvg ?? 0) * 7 * unitCost(i);
const weeklyPacks = (i: ProductPlan) => ((i.dailyAvg ?? 0) * 7) / i.product.units_per_purchase;

function ClassChip({ value }: { value: AbcClass }) {
  return (
    <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: CLASS_COLOR[value].bg }}>
      <T weight="extrabold" size={13} color={CLASS_COLOR[value].fg}>{value}</T>
    </View>
  );
}

/** Consumo da loja (igual a consumo/page.tsx do site): do que mais pesa para o que menos pesa. */
export default function ConsumoScreen() {
  const profile = useProfile();
  const load = useCallback(
    () => cached(`beststock:consumo:${profile.store.id}`, () => computePlan(profile.store.id, profile.store.count_interval_days)),
    [profile],
  );
  const { data: plan, fromCache, error, refreshing, refresh } = useLoad(load);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [search, setSearch] = useState("");

  const view = useMemo(() => {
    if (!plan) return null;
    const hasCosts = plan.items.some((i) => weeklyValue(i) > 0);
    const weight = hasCosts ? weeklyValue : weeklyPacks;
    const ranked = plan.items.filter((i) => i.dailyAvg !== null).sort((a, b) => weight(b) - weight(a));
    const rows = ranked.map((i, index) => ({
      id: i.product.id,
      rank: index + 1,
      name: i.product.name,
      category: i.product.category,
      unit: i.product.count_unit,
      weekly: (i.dailyAvg ?? 0) * 7,
      weeklyValue: weeklyValue(i),
      weight: weight(i),
      current: i.current === null ? null : Math.round(i.current * 10) / 10,
      coverageDays: i.coverageDays,
      abc: i.abc,
      status: i.status,
    }));
    return {
      hasCosts,
      rows,
      stockValue: plan.items.reduce((a, i) => a + (i.current ?? 0) * unitCost(i), 0),
      noHistory: plan.items.length - ranked.length,
    };
  }, [plan]);

  const rows = view?.rows ?? [];
  const count = (s: PlanStatus) => rows.filter((r) => r.status === s).length;
  const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
  const top = rows.length ? rows[0].weight : 0;
  const measure = view?.hasCosts ? "do valor consumido" : "das embalagens consumidas";
  const classes = CLASSES.map((c) => {
    const list = rows.filter((r) => r.abc === c);
    return { key: c, count: list.length, share: totalWeight > 0 ? (list.reduce((a, r) => a + r.weight, 0) / totalWeight) * 100 : 0 };
  }).filter((c) => c.count > 0);
  const present = STATUS_ORDER.filter((s) => count(s) > 0);
  const term = normalize(search.trim());
  const visible = rows.filter((r) => (!status || r.status === status) && (!term || normalize(r.name).includes(term)));

  return (
    <Page
      subtitle={plan?.asOf && plan.inventoryCount >= 2 ? `Média do que saiu entre as últimas contagens, até ${formatDate(plan.asOf)}.` : undefined}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      skeleton="dashboard"
      loading={!plan}
    >
      <Stack.Screen options={{ title: "Consumo" }} />
      {plan && plan.inventoryCount < 2 && (
        <Card style={{ gap: 6 }}>
          <T weight="bold">Faltam contagens</T>
          <T color={colors.muted}>O consumo é a diferença entre duas contagens do estoque. Ele aparece depois da segunda contagem fechada.</T>
          <Button label="Ir para o inventário" onPress={() => router.navigate("/inventario")} />
        </Card>
      )}
      {plan && plan.inventoryCount >= 2 && view && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat label="Risco de faltar" value={count("falta")} tone={count("falta") > 0 ? "danger" : "neutral"} hint={count("falta") > 0 ? "Podem acabar antes de a compra chegar" : "Nenhum produto em risco"} />
            <Stat label="Em excesso" value={count("excesso")} hint={count("excesso") > 0 ? "Têm muito mais do que precisam" : "Nenhum produto em excesso"} />
            <Stat label="Valor em estoque" value={view.hasCosts ? brl.format(view.stockValue) : "—"} hint={view.hasCosts ? "Pelo custo cadastrado dos produtos" : "Cadastre o custo dos produtos para ver"} />
            <Stat
              label="Sai por semana"
              value={view.hasCosts ? brl.format(rows.reduce((a, r) => a + r.weeklyValue, 0)) : "—"}
              hint={view.hasCosts ? "Valor consumido, em média" : "Cadastre o custo dos produtos para ver"}
            />
          </View>
          <Guide guide={GUIDES.consumo} />

          {classes.length > 0 && totalWeight > 0 && (
            <Card style={{ gap: 10 }}>
              <T weight="extrabold" size={18}>Onde está o consumo</T>
              <T size={14} color={colors.muted}>Quanto cada classe de produtos representa {measure} por semana.</T>
              <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 }}>
                {classes.map((c) => (
                  <View key={c.key} style={{ width: `${c.share}%`, backgroundColor: CLASS_COLOR[c.key].bg }} />
                ))}
              </View>
              {classes.map((c) => (
                <View key={c.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ClassChip value={c.key} />
                  <View>
                    <T weight="bold">{Math.round(c.share)}% {measure}</T>
                    <T size={14} color={colors.muted}>Classe {c.key} · {plural(c.count, "produto", "produtos")}</T>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {present.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[null, ...present].map((s) => {
                const active = status === s;
                return (
                  <Pressable
                    key={s ?? "tudo"}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setStatus(s === status ? null : s)}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: 14,
                      borderRadius: 20,
                      justifyContent: "center",
                      backgroundColor: active ? colors.ink : colors.card,
                      borderWidth: 1,
                      borderColor: active ? colors.ink : colors.line,
                    }}
                  >
                    <T weight="semibold" size={15} color={active ? "#fff" : colors.ink}>{s ? `${STATUS[s].text} ${count(s)}` : `Tudo ${rows.length}`}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar produto pelo nome" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Buscar produto pelo nome" />

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <View style={{ backgroundColor: colors.bg, padding: 14, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <T weight="extrabold" size={18}>Produtos por consumo</T>
              <T size={14} color={colors.muted}>
                {view.hasCosts
                  ? "Do que mais pesa no valor consumido para o que menos pesa."
                  : "Do que mais sai para o que menos sai, em embalagens. Com o custo cadastrado, a ordem passa a ser por valor."}
              </T>
              <T size={14} weight="bold">{visible.length === rows.length ? plural(rows.length, "produto", "produtos") : `${visible.length} de ${rows.length}`}</T>
            </View>
            {visible.length === 0 && <T color={colors.muted} style={{ padding: 20, textAlign: "center" }}>Nenhum produto encontrado.</T>}
            {visible.map((r) => {
              const s = STATUS[r.status];
              const share = top > 0 && r.weight > 0 ? Math.max(3, (r.weight / top) * 100) : 0;
              return (
                <View key={r.id} style={{ padding: 14, gap: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <T weight="bold" size={14} color={colors.muted} style={{ width: 34 }}>{r.rank}º</T>
                    <View style={{ flex: 1 }}>
                      <T weight="semibold">{r.name}</T>
                      {r.category ? <T size={14} color={colors.muted}>{r.category}</T> : null}
                    </View>
                    <Badge tone={s.tone}>{s.text}</Badge>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <T size={12} weight="semibold" color={colors.muted}>Sai por semana</T>
                      <T weight="bold">{formatQty(Number(r.weekly.toFixed(1)))} <T size={13} color={colors.muted}>{r.unit}</T></T>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden", marginTop: 4 }}>
                        <View style={{ height: "100%", width: `${share}%`, backgroundColor: colors.brand }} />
                      </View>
                      {r.weeklyValue > 0 && <T size={12} weight="semibold" color={colors.muted}>{brl.format(r.weeklyValue)}</T>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T size={12} weight="semibold" color={colors.muted}>Tem hoje</T>
                      {r.current !== null ? (
                        <>
                          <T weight="bold">{formatQty(r.current)} <T size={13} color={colors.muted}>{r.unit}</T></T>
                          <T size={12} weight="semibold" color={r.status === "falta" ? colors.danger : colors.muted}>
                            {r.coverageDays !== null ? coverageText(r.coverageDays) : "sem saída no período"}
                          </T>
                        </>
                      ) : (
                        <T size={14} color={colors.muted}>Não contado</T>
                      )}
                    </View>
                    <View style={{ width: 52 }}>
                      <T size={12} weight="semibold" color={colors.muted}>Classe</T>
                      {r.abc ? <ClassChip value={r.abc} /> : <T color={colors.muted}>—</T>}
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
          {view.noHistory > 0 && (
            <T size={14} color={colors.muted}>
              {`${view.noHistory} ${view.noHistory === 1 ? "produto ainda não tem" : "produtos ainda não têm"} duas contagens e por isso não ${view.noHistory === 1 ? "aparece" : "aparecem"} aqui.`}
            </T>
          )}
        </>
      )}
    </Page>
  );
}
