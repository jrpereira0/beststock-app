import { router, useLocalSearchParams } from "expo-router";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Badge, ListLink, Page } from "@/components/widgets";
import { loadStores } from "@/lib/data-admin";
import { today } from "@/lib/dates";
import { brl, planPrice, semCobranca, situation } from "@/lib/site/billing";
import type { Store } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "ativas", label: "Ativas" },
  { key: "sem-cobranca", label: "Sem cobrança" },
  { key: "atraso", label: "Com atraso" },
  { key: "bloqueadas", label: "Bloqueadas" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

/** Unidades da rede, como admin/lojas do site. */
export default function LojasScreen() {
  const { f } = useLocalSearchParams<{ f?: string }>();
  const [filter, setFilter] = useState<FilterKey>(FILTERS.some((x) => x.key === f) ? (f as FilterKey) : "todas");
  const [seenParam, setSeenParam] = useState(f);
  if (f !== seenParam) {
    setSeenParam(f);
    if (FILTERS.some((x) => x.key === f)) setFilter(f as FilterKey);
  }
  const { data, fromCache, error, refreshing, refresh } = useLoad(loadStores);
  const now = today();
  const stores = useMemo(() => data?.stores ?? [], [data]);
  const plans = useMemo(() => new Map((data?.plans ?? []).map((p) => [p.id, p])), [data]);
  const overdue = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data?.pending ?? []) if (situation(p, now) === "atrasado") m.set(p.store_id, (m.get(p.store_id) ?? 0) + Number(p.amount));
    return m;
  }, [data, now]);
  const billingText = (s: Store) => {
    const plan = s.billing_active && s.plan_id ? plans.get(s.plan_id) : undefined;
    return plan ? `${plan.name}, ${planPrice(plan)}` : "sem cobrança";
  };
  const counts: Record<FilterKey, number> = {
    todas: stores.length,
    ativas: stores.filter((s) => s.active).length,
    "sem-cobranca": stores.filter(semCobranca).length,
    atraso: stores.filter((s) => overdue.has(s.id)).length,
    bloqueadas: stores.filter((s) => !s.active).length,
  };
  const visible = stores.filter((s) =>
    filter === "ativas" ? s.active : filter === "bloqueadas" ? !s.active : filter === "atraso" ? overdue.has(s.id) : filter === "sem-cobranca" ? semCobranca(s) : true,
  );

  return (
    <Page
      tab="admin"
      title="Unidades"
      subtitle="Cada unidade tem o próprio login e só vê os próprios dados."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Button label="Nova unidade" onPress={() => router.push("/admin/lojas/nova")} />
      {stores.length === 0 ? (
        <Card style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
          <T weight="bold">Nenhuma unidade cadastrada</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Cadastre a primeira unidade para liberar o acesso do franqueado.</T>
        </Card>
      ) : (
        <>
          <Guide guide={GUIDES.lojas} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.map((x) => (
              <Pressable
                key={x.key}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === x.key }}
                onPress={() => setFilter(x.key)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  justifyContent: "center",
                  backgroundColor: filter === x.key ? colors.ink : colors.card,
                  borderWidth: 1,
                  borderColor: filter === x.key ? colors.ink : colors.line,
                }}
              >
                <T weight="semibold" size={15} color={filter === x.key ? "#fff" : colors.ink}>{`${x.label} ${counts[x.key]}`}</T>
              </Pressable>
            ))}
          </ScrollView>
          {visible.length === 0 && <T color={colors.muted}>Nenhuma unidade nesta situação.</T>}
          {visible.map((s) => (
            <ListLink
              key={s.id}
              title={s.name}
              subtitle={[s.city || "Cidade não informada", s.owner_name, billingText(s)].filter(Boolean).join(" · ")}
              onPress={() => router.push(`/admin/lojas/${s.id}`)}
              right={
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {overdue.has(s.id) && <Badge tone="danger">{`Deve ${brl.format(overdue.get(s.id) ?? 0)}`}</Badge>}
                  <Badge tone={s.active ? "ok" : "off"}>{s.active ? "Ativa" : "Bloqueada"}</Badge>
                </View>
              }
            />
          ))}
        </>
      )}
    </Page>
  );
}
