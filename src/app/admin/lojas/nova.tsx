import { router, Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { BillingFields, emptyBilling } from "@/components/billing-fields";
import { StoreFieldsForm } from "@/components/store-fields";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { Page, Toggle } from "@/components/widgets";
import { createStore, loadPlans, plansFor, type BillingInput, type StoreFields } from "@/lib/data-admin";
import { today } from "@/lib/dates";
import { hasSite } from "@/lib/site-api";
import type { Plan } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

function Step({ n, title, description }: { n: number; title: string; description: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }}>
        <T weight="extrabold" color="#fff">{String(n)}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" size={18}>{title}</T>
        <T size={14} color={colors.muted}>{description}</T>
      </View>
    </View>
  );
}

/** Nova unidade em quatro passos, como admin/lojas/nova do site. Passa pelo site, que cria o login. */
export default function NovaUnidade() {
  const { data, fromCache, error } = useLoad(loadPlans);
  return (
    <Page subtitle="Quatro passos: dados, responsável, plano e acesso. Tudo pode ser alterado depois." fromCache={fromCache} error={error} loading={!data}>
      <Stack.Screen options={{ title: "Nova unidade" }} />
      {data && <Form plans={plansFor(data.plans)} />}
    </Page>
  );
}

function Form({ plans }: { plans: Plan[] }) {
  const [f, setF] = useState<StoreFields>({ name: "", city: "", address: "", document: "", count_interval_days: "7", owner_name: "", phone: "", notes: "" });
  const [billing, setBilling] = useState<BillingInput>(() => emptyBilling(null, plans));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [copy, setCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (key: keyof StoreFields, value: string) => setF((x) => ({ ...x, [key]: value }));

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await createStore({ ...f, ...(plans.length ? billing : { ...billing, billing_active: false }), email, password, copy_catalog: copy });
    setBusy(false);
    if (!res.ok) return setMessage(res.error);
    router.replace(`/admin/lojas/${res.data.id}?criada=1`);
  }

  return (
    <>
      {!hasSite && <Notice tone="warn">Para criar unidade pelo app, falta configurar o endereço do site. Enquanto isso, use o site.</Notice>}
      <Step n={1} title="Dados da unidade" description="Como a unidade aparece no sistema." />
      <Step n={2} title="Responsável" description="Quem responde pela unidade e como falar com ele." />
      <StoreFieldsForm value={f} set={set} />
      <Step n={3} title="Plano e cobrança" description="Quanto esta unidade paga e quando. Responda às perguntas e confira o resumo no final." />
      <Card>
        <BillingFields value={billing} onChange={setBilling} plans={plans} today={today()} />
      </Card>
      <Step n={4} title="Acesso ao sistema" description="O e-mail e a senha que o franqueado vai usar para entrar. Passe os dois para ele." />
      <Card style={{ gap: 14 }}>
        <Field label="E-mail de login" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
        <Field label="Senha inicial" hint="Mínimo de 8 caracteres" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        <Toggle label="Começar com a lista padrão de produtos" hint="A unidade já nasce com os produtos cadastrados e pode editar depois." value={copy} onChange={setCopy} />
      </Card>
      <View style={{ gap: 8 }}>
        {message && <Notice tone="danger">{message}</Notice>}
        <Button label={busy ? "Criando…" : "Criar unidade"} busy={busy} disabled={!hasSite} onPress={() => void save()} />
      </View>
    </>
  );
}
