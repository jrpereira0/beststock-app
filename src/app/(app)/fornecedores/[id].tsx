import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert as Dialog } from "react-native";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { Footer, Page } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { supplierRow, type SupplierInput } from "@/lib/cadastros";
import { deleteSupplier, loadSupplier, saveSupplier } from "@/lib/data-cadastros";
import type { Supplier } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const empty = async () => ({ data: null as Supplier | null, fromCache: false });

export default function FornecedorScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = raw === "novo" ? null : raw;
  const profile = useProfile();
  const load = useCallback(() => (id ? loadSupplier(profile, id) : empty()), [profile, id]);
  const { data, fromCache, error } = useLoad<Supplier | null>(load);
  if (id && !data) {
    return (
      <Page error={error} loading>
        <Stack.Screen options={{ title: "Fornecedor" }} />
      </Page>
    );
  }
  return <SupplierForm id={id} data={data} fromCache={fromCache} />;
}

function SupplierForm({ id, data, fromCache }: { id: string | null; data: Supplier | null; fromCache: boolean }) {
  const profile = useProfile();
  const [form, setForm] = useState<SupplierInput>(() => ({
    name: data?.name ?? "",
    contact: data?.contact ?? "",
    lead_time_days: String(data?.lead_time_days ?? 7),
    lead_time_dry_days: String(data?.lead_time_dry_days ?? 12),
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const set = (key: keyof SupplierInput, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setMessage(null);
    const res = supplierRow(form);
    if ("error" in res) return setMessage(res.error ?? null);
    setSaving(true);
    const err = await saveSupplier(profile, id, res.row);
    setSaving(false);
    if (err) return setMessage(err);
    router.back();
  }

  function remove() {
    if (!id) return;
    Dialog.alert("Excluir este fornecedor?", "Os produtos ligados a ele continuam cadastrados, mas ficam sem fornecedor.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const err = await deleteSupplier(profile, id);
          if (err) Dialog.alert("Não excluiu", err);
          else router.back();
        },
      },
    ]);
  }

  return (
    <Page
      fromCache={fromCache}
      footer={
        <Footer>
          {message && <Notice tone="danger">{message}</Notice>}
          <Button label="Salvar fornecedor" busy={saving} onPress={() => void save()} />
        </Footer>
      }
    >
      <Stack.Screen options={{ title: id ? (data?.name ?? "Fornecedor") : "Novo fornecedor" }} />
      {(
        <>
          <Card style={{ gap: 14 }}>
            <T weight="extrabold" size={18}>Identificação</T>
            <Field label="Nome do fornecedor" value={form.name} onChangeText={(v) => set("name", v)} />
            <Field label="Contato" hint="Telefone, WhatsApp ou e-mail" value={form.contact} onChangeText={(v) => set("contact", v)} />
          </Card>
          <Card style={{ gap: 14 }}>
            <T weight="extrabold" size={18}>Entrega</T>
            <T size={14} color={colors.muted}>
              Cada produto usa o prazo do tipo dele. Gelado e seco podem chegar em dias diferentes, mesmo sendo o mesmo fornecedor.
            </T>
            <Field
              label="Prazo dos gelados (dias)"
              hint="Açaí, sorvete, pote, brownie, bites e stickzinho. No mesmo dia = 0"
              value={form.lead_time_days}
              onChangeText={(v) => set("lead_time_days", v)}
              keyboardType="number-pad"
            />
            <Field
              label="Prazo dos secos (dias)"
              hint="Acompanhamentos e o que não vai no freezer. No mesmo dia = 0"
              value={form.lead_time_dry_days}
              onChangeText={(v) => set("lead_time_dry_days", v)}
              keyboardType="number-pad"
            />
          </Card>
          {id && (
            <Card style={{ gap: 10 }}>
              <T weight="extrabold" size={18}>Excluir fornecedor</T>
              <T size={14} color={colors.muted}>Os produtos ligados a ele continuam cadastrados, mas ficam sem fornecedor.</T>
              <Button label="Excluir fornecedor" variant="danger" onPress={remove} />
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
