import { Stack } from "expo-router";
import { useState } from "react";
import { Alert as Dialog, Pressable, View } from "react-native";
import { Button, Card, Field, Notice, SectionTitle, T } from "@/components/ui";
import { Badge, Choice, Page, Toggle } from "@/components/widgets";
import { deleteAnnouncement, loadAnnouncements, sendAnnouncement } from "@/lib/data-admin";
import { formatDate } from "@/lib/dates";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

/** Avisos para as unidades, como admin/avisos do site. Aparecem no sino de cada unidade. */
export default function AvisosScreen() {
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(loadAnnouncements);
  const [storeId, setStoreId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const stores = data?.stores ?? [];
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const activeCount = stores.filter((s) => s.active).length;

  async function send() {
    setBusy(true);
    setMessage(null);
    const err = await sendAnnouncement({ store_id: storeId, title, body, important });
    setBusy(false);
    if (err) return setMessage({ tone: "danger", text: err });
    setTitle("");
    setBody("");
    setImportant(false);
    setMessage({ tone: "ok", text: "Aviso enviado." });
    void reload();
  }
  function remove(id: string) {
    Dialog.alert("Apagar este aviso?", "Ele some das notificações de todas as unidades que o receberam.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          const err = await deleteAnnouncement(id);
          if (err) Dialog.alert("Não apagou", err);
          else void reload();
        },
      },
    ]);
  }

  return (
    <Page
      subtitle="Mensagens que você envia para as unidades. Elas aparecem nas notificações de cada uma."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Stack.Screen options={{ title: "Avisos" }} />
      {data && (
        <>
          <Card style={{ gap: 12 }}>
            <T weight="extrabold" size={18}>Novo aviso</T>
            <Choice label="Para quem" value={storeId} options={[{ value: "", label: "Todas as unidades" }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} onChange={setStoreId} />
            <Field label="Título" value={title} onChangeText={setTitle} />
            <Field label="Mensagem" value={body} onChangeText={setBody} multiline style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 12 }} />
            <Toggle label="Marcar como importante" hint="Aparece em destaque para a unidade." value={important} onChange={setImportant} />
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            <Button label={busy ? "Enviando…" : "Enviar aviso"} busy={busy} onPress={() => void send()} />
          </Card>

          <SectionTitle>Avisos enviados</SectionTitle>
          {data.announcements.length === 0 ? (
            <Card style={{ alignItems: "center", gap: 4, paddingVertical: 24 }}>
              <T weight="bold">Nenhum aviso enviado</T>
              <T color={colors.muted} style={{ textAlign: "center" }}>Use os avisos para comunicar reajuste, manutenção ou novidades às unidades.</T>
            </Card>
          ) : (
            data.announcements.map((a) => {
              const audience = a.store_id ? 1 : activeCount;
              return (
                <Card key={a.id} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <T weight="semibold">{a.title}</T>
                      {a.level === "warn" && <Badge tone="warn">Importante</Badge>}
                    </View>
                    {a.body ? <T size={14} color={colors.muted}>{a.body}</T> : null}
                    <T size={14} color={colors.muted}>
                      {`${formatDate(a.created_at.slice(0, 10))} · para ${a.store_id ? (names.get(a.store_id) ?? "unidade removida") : "todas as unidades"} · lido por ${data.reads[a.id] ?? 0} de ${audience}`}
                    </T>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Apagar aviso ${a.title}`} onPress={() => remove(a.id)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                    <T weight="bold" size={18} color={colors.danger}>✕</T>
                  </Pressable>
                </Card>
              );
            })
          )}
        </>
      )}
    </Page>
  );
}
