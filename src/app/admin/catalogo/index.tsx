import { router, Stack } from "expo-router";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { Button, Card, T, styles as ui } from "@/components/ui";
import { ListLink, Page } from "@/components/widgets";
import { groupProducts } from "@/lib/count-rules";
import { loadCatalog } from "@/lib/data-admin";
import { formatQty } from "@/lib/dates";
import { brl } from "@/lib/site/billing";
import type { CatalogProduct } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const describe = (p: CatalogProduct) =>
  [
    p.storage === "seco" ? "Seco" : "Gelado",
    Number(p.units_per_purchase) === 1 && p.purchase_unit === p.count_unit
      ? `conta e compra em ${p.count_unit}`
      : `conta em ${p.count_unit} · compra em ${p.purchase_unit} de ${formatQty(Number(p.units_per_purchase))} ${p.count_unit}`,
    Number(p.cost_per_purchase) > 0 ? brl.format(Number(p.cost_per_purchase)) : "sem custo",
  ].join(" · ");

/** Lista padrão de produtos da rede, como admin/catalogo do site. */
export default function CatalogoScreen() {
  const { data, fromCache, error, refreshing, refresh } = useLoad(loadCatalog);
  const [search, setSearch] = useState("");
  const items = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => groupProducts(items, { search }), [items, search]);
  return (
    <Page
      subtitle={data ? `${items.length} produtos copiados para cada loja nova. O custo da rede vale para todas as lojas.` : undefined}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Stack.Screen options={{ title: "Lista padrão" }} />
      <Button label="Novo produto" onPress={() => router.push("/admin/catalogo/novo")} />
      {items.length === 0 ? (
        <Card style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
          <T weight="bold">A lista padrão está vazia</T>
          <T color={colors.muted}>Os produtos daqui são copiados para as lojas novas.</T>
        </Card>
      ) : (
        <>
          <Guide guide={GUIDES.catalogo} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar produto" placeholderTextColor={colors.muted} style={ui.input} accessibilityLabel="Buscar produto" />
          {groups.map(([category, list]) => (
            <View key={category} style={{ gap: 8 }}>
              <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>{category}</T>
              {list.map((p) => (
                <ListLink key={p.id} title={p.name} subtitle={describe(p)} onPress={() => router.push(`/admin/catalogo/${p.id}`)} />
              ))}
            </View>
          ))}
        </>
      )}
    </Page>
  );
}
