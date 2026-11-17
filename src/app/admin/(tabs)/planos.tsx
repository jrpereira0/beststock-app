import { router } from "expo-router";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { Button, Card, T } from "@/components/ui";
import { Badge, ListLink, Page } from "@/components/widgets";
import { loadPlans } from "@/lib/data-admin";
import { planPrice } from "@/lib/site/billing";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** Planos de cobrança, como admin/planos do site. */
export default function PlanosScreen() {
  const { data, fromCache, error, refreshing, refresh } = useLoad(loadPlans);
  const plans = data?.plans ?? [];
  const unitsText = (id: string) => {
    const n = data?.units[id] ?? 0;
    return n === 0 ? "nenhuma unidade" : `${n} ${n === 1 ? "unidade" : "unidades"}`;
  };
  return (
    <Page
      tab="admin"
      title="Planos"
      subtitle="O valor e a duração de cada plano. A cobrança de cada unidade segue o plano dela."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Button label="Novo plano" onPress={() => router.push("/admin/planos/novo")} />
      {plans.length === 0 ? (
        <Card style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
          <T weight="bold">Nenhum plano cadastrado</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Crie um plano com valor e duração. Depois, escolha o plano no cadastro de cada unidade.</T>
        </Card>
      ) : (
        <>
          <Guide guide={GUIDES.planos} />
          {plans.map((p) => (
            <ListLink
              key={p.id}
              title={p.name}
              subtitle={`${planPrice(p)} · ${unitsText(p.id)}`}
              onPress={() => router.push(`/admin/planos/${p.id}`)}
              right={p.active ? undefined : <Badge>Desativado</Badge>}
            />
          ))}
          <T size={14} color={colors.muted}>Para colocar uma unidade em um plano, abra a unidade em Unidades e use a seção Plano.</T>
        </>
      )}
    </Page>
  );
}
