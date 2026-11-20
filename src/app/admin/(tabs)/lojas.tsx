import { router, useLocalSearchParams } from "expo-router";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Button, Card, T, styles as ui } from "@/components/ui";
import { Badge, ListLink, Page } from "@/components/widgets";
import { loadStores } from "@/lib/data-admin";
import { brl, planPrice } from "@/lib/site/billing";
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
const PAGE = 50;

/** Unidades da rede, como admin/lojas do site. */
export default function LojasScreen() {
  const { f } = useLocalSearchParams<{ f?: string }>();
  const [filter, setFilter] = useState<FilterKey>(FILTERS.some((x) => x.key === f) ? (f as FilterKey) : "todas");
  const [seenParam, setSeenParam] = useState(f);
  if (f !== seenParam) {
    setSeenParam(f);
    if (FILTERS.some((x) => x.key === f)) setFilter(f as FilterKey);
  }
  // Busca e "Mostrar mais": o banco filtra e devolve só as primeiras unidades (vale com qualquer número delas).
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const load = useCallback(() => loadStores(filter, search, limit), [filter, search, limit]);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(load);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void reload();
  }, [load, reload]);
  const stores = useMemo(() => data?.stores ?? [], [data]);
  const plans = useMemo(() => new Map((data?.plans ?? []).map((p) => [p.id, p])), [data]);
  const billingText = (s: Store) => {
    const plan = s.billing_active && s.plan_id ? plans.get(s.plan_id) : undefined;
    return plan ? `${plan.name}, ${planPrice(plan)}` : "sem cobrança";
  };
  const c = data?.counts;
  const counts: Record<FilterKey, number> = {
    todas: c?.total ?? 0,
    ativas: c?.active ?? 0,
    "sem-cobranca": c?.unbilled ?? 0,
    atraso: c?.overdue ?? 0,
    bloqueadas: c?.blocked ?? 0,
  };
  const visible = stores;
  const choose = (k: FilterKey) => {
    setFilter(k);
    setLimit(PAGE);
  };

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
      {data && counts.todas === 0 ? (
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
                onPress={() => choose(x.key)}
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => {
                setSearch(typed);
                setLimit(PAGE);
              }}
              returnKeyType="search"
              placeholder="Buscar por nome, cidade ou responsável"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Buscar unidade"
              style={[ui.input, { flex: 1 }]}
            />
            {search !== "" && (
              <Button
                label="Limpar"
                variant="secondary"
                onPress={() => {
                  setTyped("");
                  setSearch("");
                  setLimit(PAGE);
                }}
              />
            )}
          </View>
          {visible.length === 0 && <T color={colors.muted}>{search ? `Nenhuma unidade encontrada com "${search}".` : "Nenhuma unidade nesta situação."}</T>}
          {visible.map((s) => (
            <ListLink
              key={s.id}
              title={s.name}
              subtitle={[s.city || "Cidade não informada", s.owner_name, billingText(s)].filter(Boolean).join(" · ")}
              onPress={() => router.push(`/admin/lojas/${s.id}`)}
              right={
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {Number(s.overdue_amount) > 0 && <Badge tone="danger">{`Deve ${brl.format(Number(s.overdue_amount))}`}</Badge>}
                  <Badge tone={s.active ? "ok" : "off"}>{s.active ? "Ativa" : "Bloqueada"}</Badge>
                </View>
              }
            />
          ))}
          {data && data.total > visible.length && (
            <Button label={`Mostrar mais (${visible.length} de ${data.total})`} variant="secondary" onPress={() => setLimit((n) => n + PAGE)} />
          )}
        </>
      )}
    </Page>
  );
}
