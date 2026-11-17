import { Stack } from "expo-router";
import { Alert as Dialog, Linking, Pressable, View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Badge, Page } from "@/components/widgets";
import { deleteLead, loadLeads, setLeadHandled, type Lead } from "@/lib/data-admin";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** (11) 99999-0000 a partir de só números (igual ao site). */
function phoneText(digits: string): string {
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length < 10) return digits;
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`;
}
const whatsapp = (digits: string) => `https://wa.me/${digits.startsWith("55") && digits.length > 11 ? digits : `55${digits}`}`;
const when = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/** Pedidos de demonstração da página de apresentação, como admin/contatos do site. */
export default function ContatosScreen() {
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(loadLeads);
  const leads = data ?? [];
  const open = leads.filter((l) => !l.handled).length;

  async function toggle(l: Lead) {
    const err = await setLeadHandled(l.id, !l.handled);
    if (err) Dialog.alert("Não salvou", err);
    else void reload();
  }
  function remove(l: Lead) {
    Dialog.alert(
      "Apagar este contato?",
      `Os dados de ${l.name} são apagados de vez. Use quando a pessoa pedir a exclusão ou o contato não fizer mais sentido.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            const err = await deleteLead(l.id);
            if (err) Dialog.alert("Não apagou", err);
            else void reload();
          },
        },
      ],
    );
  }

  return (
    <Page
      subtitle={
        leads.length === 0
          ? "Pedidos de demonstração enviados pela página de apresentação do sistema."
          : `${open} ${open === 1 ? "pedido de demonstração para responder" : "pedidos de demonstração para responder"}, de ${leads.length} recebidos.`
      }
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Stack.Screen options={{ title: "Contatos" }} />
      {data && leads.length === 0 && (
        <Card style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
          <T weight="bold">Nenhum pedido ainda</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>Quando alguém pedir uma demonstração na página de apresentação, o contato aparece aqui.</T>
        </Card>
      )}
      {leads.map((l) => (
        <Card key={l.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <T weight="semibold">{l.name}</T>
            {l.handled ? <Badge>Atendido</Badge> : <Badge tone="warn">Para responder</Badge>}
          </View>
          <T size={14} color={colors.muted}>{[l.store_name, l.city, l.stores_count].filter(Boolean).join(" · ") || "Sem dados da loja"}</T>
          {l.message ? <T>{l.message}</T> : null}
          <T size={14} color={colors.muted}>{`${phoneText(l.phone)} · recebido em ${when(l.created_at)}`}</T>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button label="WhatsApp" variant="secondary" style={{ minHeight: 44 }} onPress={() => void Linking.openURL(whatsapp(l.phone))} />
            <Button label={l.handled ? "Reabrir" : "Marcar como atendido"} variant="secondary" style={{ minHeight: 44, flex: 1 }} onPress={() => void toggle(l)} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Apagar o contato de ${l.name}`} onPress={() => remove(l)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <T weight="bold" size={18} color={colors.danger}>✕</T>
            </Pressable>
          </View>
        </Card>
      ))}
    </Page>
  );
}
