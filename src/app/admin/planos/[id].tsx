import { router, Stack, useLocalSearchParams } from "expo-router";
import { Dialog } from "@/lib/dialog";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { Choice, Page, Toggle } from "@/components/widgets";
import { deletePlan, loadPlans, savePlan } from "@/lib/data-admin";
import { durationName } from "@/lib/site/billing";
import type { Plan } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const FREQUENCIES = [1, 2, 3, 6, 12];
function frequencyText(months: number): string {
  if (months === 1) return "Todo mês (mensal)";
  if (months === 12) return "Uma vez por ano (anual)";
  const name = durationName(months);
  return name.startsWith("A cada") ? name : `A cada ${months} meses (${name.toLowerCase()})`;
}

/** Cadastro do plano, como admin/planos/[id] e novo do site. */
export default function PlanoScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = raw === "novo" ? null : raw;
  const load = useCallback(() => loadPlans(), []);
  const { data, fromCache, error } = useLoad(load);
  const plan = id ? data?.plans.find((p) => p.id === id) : undefined;
  return (
    <Page fromCache={fromCache} error={error ?? (data && id && !plan ? "Plano não encontrado." : null)} loading={!data}>
      <Stack.Screen options={{ title: id ? (plan?.name ?? "Plano") : "Novo plano" }} />
      {data && (!id || plan) && <PlanForm plan={plan} inUse={Boolean(id && (data.units[id] ?? 0) > 0)} />}
    </Page>
  );
}

function PlanForm({ plan, inUse }: { plan?: Plan; inUse: boolean }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? Number(plan.price).toFixed(2).replace(".", ",") : "");
  const [months, setMonths] = useState(String(plan?.duration_months ?? 1));
  const [description, setDescription] = useState(plan?.description ?? "");
  const [active, setActive] = useState(plan?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const options = [...new Set([...FREQUENCIES, plan?.duration_months ?? 1])].sort((a, b) => a - b);

  async function save() {
    setBusy(true);
    setMessage(null);
    const err = await savePlan(plan?.id ?? null, { name, price, duration_months: Number(months), description, active });
    setBusy(false);
    if (err) return setMessage(err);
    router.back();
  }
  function remove() {
    if (!plan) return;
    Dialog.alert("Excluir este plano?", "Só dá para excluir plano sem unidade. Com unidades, desative em vez de excluir.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const err = await deletePlan(plan.id);
          if (err) Dialog.alert("Não excluiu", err);
          else router.back();
        },
      },
    ]);
  }

  return (
    <>
      <Card style={{ gap: 14 }}>
        <T size={14} color={colors.muted}>
          O plano diz quanto a unidade paga e de quanto em quanto tempo. Exemplo: plano Anual, valor 1800,00, uma vez por ano. A unidade recebe uma cobrança de R$ 1.800,00 por ano.
        </T>
        <Field label="Nome do plano" placeholder="Exemplo: Mensal" value={name} onChangeText={setName} />
        <Field label="Valor (R$)" hint="Quanto a unidade paga em cada cobrança" placeholder="0,00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        {inUse && plan ? (
          <>
            <T weight="semibold">De quanto em quanto tempo</T>
            <T>{frequencyText(plan.duration_months)}</T>
            <T size={14} color={colors.muted}>Há unidades neste plano. Para outro período, crie um plano novo.</T>
          </>
        ) : (
          <Choice label="De quanto em quanto tempo" value={months} options={options.map((m) => ({ value: String(m), label: frequencyText(m) }))} onChange={setMonths} />
        )}
        <Field
          label="Descrição"
          hint="Opcional. Só o administrador vê."
          value={description}
          onChangeText={setDescription}
          multiline
          style={{ minHeight: 70, textAlignVertical: "top", paddingTop: 12 }}
        />
        <Toggle label="Plano ativo (pode ser escolhido para as unidades)" value={active} onChange={setActive} />
      </Card>
      {plan && <Button label="Excluir plano" variant="danger" onPress={remove} />}
      <View style={{ gap: 8 }}>
        {message && <Notice tone="danger">{message}</Notice>}
        <Button label="Salvar plano" busy={busy} onPress={() => void save()} />
      </View>
    </>
  );
}
