import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { Button, Card, T } from "@/components/ui";
import { ListLink, Page } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { loadProducts } from "@/lib/data-cadastros";
import type { Supplier } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const daysText = (days: number) => (days === 0 ? "no mesmo dia" : `em ${days} ${days === 1 ? "dia" : "dias"}`);
const deliveryText = (s: Supplier) => `Gelados ${daysText(s.lead_time_days)} · secos ${daysText(s.lead_time_dry_days)}`;

export default function FornecedoresScreen() {
  const profile = useProfile();
  const load = useCallback(() => loadProducts(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh } = useLoad(load);
  const suppliers = data?.suppliers ?? [];
  return (
    <Page
      subtitle="De quem você compra e em quantos dias a mercadoria chega."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Stack.Screen options={{ title: "Fornecedores" }} />
      <Button label="Novo fornecedor" onPress={() => router.push("/fornecedores/novo")} />
      {suppliers.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 28, gap: 4 }}>
          <T weight="bold">Nenhum fornecedor cadastrado</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>
            Com o fornecedor cadastrado, a lista de compras sai separada por fornecedor e considera o prazo de entrega.
          </T>
        </Card>
      ) : (
        <>
          <T size={14} color={colors.muted}>
            Gelados e secos podem ter prazos diferentes. Na lista de compras, cada produto usa o prazo do tipo dele, e cada fornecedor tem a sua lista.
          </T>
          {suppliers.map((s) => (
            <ListLink key={s.id} title={s.name} subtitle={deliveryText(s)} onPress={() => router.push(`/fornecedores/${s.id}`)} />
          ))}
        </>
      )}
    </Page>
  );
}
