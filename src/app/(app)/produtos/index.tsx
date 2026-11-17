import { router, Stack, useLocalSearchParams } from "expo-router";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Button, Card, T, styles as ui } from "@/components/ui";
import { Badge, ListLink, Page } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { groupProducts } from "@/lib/count-rules";
import { loadProducts } from "@/lib/data-cadastros";
import { formatQty } from "@/lib/dates";
import { brl } from "@/lib/site/billing";
import type { Product } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

function describe(p: Product) {
  const parts = [p.storage === "seco" ? "Seco" : "Gelado", `Conta em ${p.count_unit}`];
  parts.push(
    Number(p.units_per_purchase) === 1 && p.purchase_unit === p.count_unit
      ? `compra em ${p.purchase_unit}`
      : `compra em ${p.purchase_unit} de ${formatQty(Number(p.units_per_purchase))} ${p.count_unit}`,
  );
  if (Number(p.cost_per_purchase) > 0) parts.push(brl.format(Number(p.cost_per_purchase)));
  return parts.join(" · ");
}

const MISSING = { fornecedor: "Sem fornecedor", custo: "Sem custo", minimo: "Sem estoque mínimo" } as const;
type Missing = keyof typeof MISSING;
function missingOf(p: Product): Missing[] {
  if (!p.active) return [];
  const list: Missing[] = [];
  if (!p.supplier_id) list.push("fornecedor");
  if (!(Number(p.cost_per_purchase) > 0)) list.push("custo");
  if (!(Number(p.min_stock) > 0)) list.push("minimo");
  return list;
}

export default function ProdutosScreen() {
  const profile = useProfile();
  const load = useCallback(() => loadProducts(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh } = useLoad(load);
  const [search, setSearch] = useState("");
  const { falta } = useLocalSearchParams<{ falta?: string }>();
  const [missing, setMissing] = useState<Missing | null>(falta === "fornecedor" || falta === "custo" || falta === "minimo" ? falta : null);

  const products = useMemo(() => data?.products ?? [], [data]);
  const active = products.filter((p) => p.active).length;
  const groups = useMemo(
    () => groupProducts(products, { search, keep: missing ? (p) => missingOf(p).includes(missing) : undefined }),
    [products, search, missing],
  );
  const counts = useMemo(() => {
    const c: Record<Missing, number> = { fornecedor: 0, custo: 0, minimo: 0 };
    for (const p of products) for (const m of missingOf(p)) c[m]++;
    return c;
  }, [products]);

  return (
    <Page
      subtitle={data ? `${products.length} ${products.length === 1 ? "produto" : "produtos"}, ${active} na contagem.` : undefined}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Stack.Screen options={{ title: "Produtos" }} />
      <Button label="Novo produto" onPress={() => router.push("/produtos/novo")} />
      {products.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 28, gap: 4 }}>
          <T weight="bold">Nenhum produto cadastrado</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Cadastre os produtos que você quer controlar no estoque.</T>
        </Card>
      ) : (
        <>
          <Guide guide={GUIDES.produtos} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar produto"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Buscar produto"
            style={ui.input}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(Object.keys(MISSING) as Missing[]).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: missing === m }}
                onPress={() => setMissing(missing === m ? null : m)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  justifyContent: "center",
                  backgroundColor: missing === m ? colors.ink : colors.card,
                  borderWidth: 1,
                  borderColor: missing === m ? colors.ink : colors.line,
                }}
              >
                <T weight="semibold" size={15} color={missing === m ? "#fff" : colors.ink}>
                  {MISSING[m]} {counts[m]}
                </T>
              </Pressable>
            ))}
          </ScrollView>
          {groups.length === 0 && <T color={colors.muted}>Nenhum produto encontrado.</T>}
          {groups.map(([category, list]) => (
            <View key={category} style={{ gap: 8 }}>
              <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>
                {category}
              </T>
              {list.map((p) => (
                <ListLink
                  key={p.id}
                  title={p.name}
                  subtitle={describe(p)}
                  onPress={() => router.push(`/produtos/${p.id}`)}
                  right={!p.active ? <Badge>Inativo</Badge> : missingOf(p).length > 0 && missing ? <Badge tone="warn">{MISSING[missing]}</Badge> : undefined}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </Page>
  );
}
