import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { Alert as Dialog, View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Badge, Page } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { loadClosedCount, reopenInventory } from "@/lib/data-inventario";
import { formatDate, formatDay, formatQty } from "@/lib/dates";
import { compareCategories } from "@/lib/site/category-order";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** Contagem fechada: só leitura. O gerente pode reabrir a mais recente para corrigir. */
export function ClosedCount({ id, onReopened }: { id: string; onReopened: () => void }) {
  const profile = useProfile();
  const load = useCallback(() => loadClosedCount(profile, id, compareCategories), [profile, id]);
  const { data, fromCache, error, refreshing, refresh } = useLoad(load);
  const [busy, setBusy] = useState(false);

  function reopen() {
    Dialog.alert("Reabrir a contagem?", "Ela volta a ficar em andamento para corrigir os números. A lista de compras muda depois que fechar de novo.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Reabrir",
        onPress: async () => {
          setBusy(true);
          const err = await reopenInventory(profile, id);
          setBusy(false);
          if (err) Dialog.alert("Não reabriu", err);
          else onReopened();
        },
      },
    ]);
  }

  return (
    <Page refreshing={refreshing} onRefresh={() => void refresh()} fromCache={fromCache} error={error} loading={!data}>
      {data && (
        <>
          <Stack.Screen options={{ title: `Inventário de ${formatDay(data.inventory.counted_on)}` }} />
          <View style={{ gap: 6 }}>
            <T weight="extrabold" size={24}>Inventário de {formatDate(data.inventory.counted_on)}</T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="ok">Fechado</Badge>
              <T color={colors.muted}>
                {data.counted} {data.counted === 1 ? "produto contado" : "produtos contados"}
              </T>
            </View>
            {data.whoText !== "" && <T size={14} color={colors.muted}>{data.whoText}</T>}
          </View>
          {data.isLatest && profile.access === "gerente" && (
            <Button label="Reabrir para corrigir" variant="secondary" busy={busy} onPress={reopen} />
          )}
          {data.groups.map(([category, items]) => (
            <View key={category} style={{ gap: 8 }}>
              <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 8 }}>
                {category}
              </T>
              {items.map((p) => (
                <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T weight="semibold">{p.name}</T>
                    {p.stockout && <T size={14} color={colors.muted}>acabou em {formatDate(p.stockout)}</T>}
                    {p.who && (
                      <T size={14} color={colors.muted}>
                        {p.who}
                        {p.when ? ` · ${p.when}` : ""}
                      </T>
                    )}
                  </View>
                  {p.quantity !== null ? (
                    <T weight="extrabold" size={18}>
                      {formatQty(p.quantity)} <T size={14} weight="semibold" color={colors.muted}>{p.count_unit}</T>
                    </T>
                  ) : (
                    <T color={colors.muted}>não contado</T>
                  )}
                </Card>
              ))}
            </View>
          ))}
          <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
        </>
      )}
    </Page>
  );
}
