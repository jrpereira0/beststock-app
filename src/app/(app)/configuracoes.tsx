import { Stack } from "expo-router";
import { Dialog } from "@/lib/dialog";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Button, Card, Field, Notice, SectionTitle, T, styles as ui } from "@/components/ui";
import { Guide } from "@/components/guide";
import { SetupChecklist } from "@/components/setup-checklist";
import { Badge, Choice, Page } from "@/components/widgets";
import { GUIDES } from "@/lib/guides";
import { useAuth, useProfile } from "@/lib/auth";
import { intervalDays } from "@/lib/cadastros";
import { saveSettings } from "@/lib/data-cadastros";
import { addLogin, loadSettings, removeLogin, updateLogin, type StoreLogin } from "@/lib/data-loja";
import { hasSite } from "@/lib/site-api";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const ACCESS_LABEL = { gerente: "Gerente", funcionario: "Funcionário" } as const;
const ACCESS_TEXT = {
  gerente: "Faz tudo: compras, produtos, fornecedores, valores e logins.",
  funcionario: "Conta o estoque e lança entradas e perdas. Não vê valores nem compras.",
} as const;

type Editing = { id: string | null; name: string; email: string; access: "gerente" | "funcionario"; password: string };

export default function ConfiguracoesScreen() {
  const profile = useProfile();
  const { refreshProfile } = useAuth();
  const load = useCallback(() => loadSettings(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(load);
  const [interval, setIntervalText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);


  async function saveInterval() {
    setMessage(null);
    const days = intervalDays(interval || String(data?.interval ?? ""));
    if (typeof days !== "number") return setMessage({ tone: "danger", text: days.error });
    setSaving(true);
    const err = await saveSettings(days);
    setSaving(false);
    if (err) return setMessage({ tone: "danger", text: err });
    setMessage({ tone: "ok", text: "Configurações salvas." });
    void refreshProfile();
  }

  const logins = data?.logins ?? [];
  const managers = logins.filter((l) => l.access === "gerente").length;
  const display = (l: StoreLogin) => (l.name && l.name !== profile.store.name ? l.name : "Login principal da loja");

  async function submitLogin() {
    if (!editing) return;
    setBusy(true);
    setEditError(null);
    const res = editing.id
      ? await updateLogin({ id: editing.id, name: editing.name, access: editing.access, password: editing.password })
      : await addLogin({ name: editing.name, email: editing.email, password: editing.password, access: editing.access });
    setBusy(false);
    if (!res.ok) return setEditError(res.error);
    setEditing(null);
    // Espera a janela do login terminar de fechar: no iPhone, um aviso aberto no meio do fechamento não aparece.
    if (res.data.ok) setTimeout(() => Dialog.alert("Pronto", String(res.data.ok)), 450);
    void reload();
  }

  function remove(l: StoreLogin) {
    Dialog.alert(
      "Remover este login?",
      `${display(l)} (${l.email}) deixa de entrar no sistema. As contagens e os lançamentos que essa pessoa fez continuam na loja.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            const res = await removeLogin(l.id);
            if (!res.ok) Dialog.alert("Não removeu", res.error);
            else void reload();
          },
        },
      ],
    );
  }

  const self = editing?.id === profile.id;
  const lastManager = Boolean(editing?.id && logins.find((l) => l.id === editing.id)?.access === "gerente" && managers < 2);

  return (
    <Page
      subtitle="O que preencher e manter para o consumo e a lista de compras saírem certos."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      loading={!data}
    >
      <Stack.Screen options={{ title: "Configurações" }} />
      {data && (
        <>
          <SectionTitle>Como o sistema calcula a compra</SectionTitle>
          <Guide guide={GUIDES.calculo} />

          <SectionTitle>Para os números saírem certos</SectionTitle>
          <SetupChecklist facts={data.facts} />

          <SectionTitle>Desta loja</SectionTitle>
          <Card style={{ gap: 12 }}>
            <T weight="extrabold" size={18}>Contagem do estoque</T>
            <T size={14} color={colors.muted}>
              De quantos em quantos dias você faz o inventário. O sistema avisa quando chega o dia e calcula cada compra para durar até a contagem seguinte.
            </T>
            <Field
              label="Contar a cada quantos dias"
              hint="Toda semana = 7, a cada quinze dias = 15"
              value={interval || (data ? String(data.interval) : "")}
              onChangeText={setIntervalText}
              keyboardType="number-pad"
            />
            {message && <Notice tone={message.tone}>{message.text}</Notice>}
            <Button label="Salvar" busy={saving} onPress={() => void saveInterval()} />
          </Card>

          <Card style={{ gap: 12 }}>
            <T weight="extrabold" size={18}>Logins da loja</T>
            <T size={14} color={colors.muted}>
              Crie um login para cada pessoa. O funcionário conta o estoque e lança entradas e perdas; o gerente também compra, cadastra e vê os valores. Fica registrado quem contou cada produto.
            </T>
            {!hasSite && <Notice tone="warn">Para criar e editar logins pelo app, falta configurar o endereço do site. Enquanto isso, use o site.</Notice>}
            {logins.map((l) => {
              const isSelf = l.id === profile.id;
              const last = l.access === "gerente" && managers < 2;
              return (
                <View key={l.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <T weight="semibold">{display(l)}</T>
                    <Badge tone={l.access === "gerente" ? "ok" : "off"}>{ACCESS_LABEL[l.access]}</Badge>
                    {isSelf && <T size={14} color={colors.muted}>(você)</T>}
                  </View>
                  <T size={14} color={colors.muted}>{l.email}</T>
                  {hasSite && (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button
                        label="Editar"
                        variant="secondary"
                        style={{ flex: 1, minHeight: 44 }}
                        onPress={() => {
                          setEditError(null);
                          setEditing({ id: l.id, name: l.name, email: l.email, access: l.access, password: "" });
                        }}
                      />
                      {!isSelf && !last && <Button label="Remover" variant="danger" style={{ flex: 1, minHeight: 44 }} onPress={() => remove(l)} />}
                    </View>
                  )}
                </View>
              );
            })}
            {hasSite && (
              <Button
                label="Adicionar login"
                onPress={() => {
                  setEditError(null);
                  setEditing({ id: null, name: "", email: "", access: "funcionario", password: "" });
                }}
              />
            )}
          </Card>

          <Card style={{ gap: 8 }}>
            <T weight="extrabold" size={18}>Loja</T>
            <T size={14} color={colors.muted}>Para trocar o nome ou a cidade, fale com o administrador.</T>
            <T weight="semibold">Nome</T>
            <T>{profile.store.name}</T>
            <T weight="semibold">Cidade</T>
            <T>{data.city || "—"}</T>
          </Card>
        </>
      )}

      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing && (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, backgroundColor: colors.bg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <T weight="extrabold" size={22}>{editing.id ? "Editar login" : "Novo login"}</T>
            <T color={colors.muted}>
              {editing.id ? editing.email : "Cada pessoa entra com o próprio e-mail. Fica registrado quem contou cada produto e quem lançou cada entrada."}
            </T>
            <Field label="Nome da pessoa" hint={editing.id ? undefined : "Exemplo: Ana"} value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} />
            {!editing.id && (
              <Field
                label="E-mail"
                value={editing.email}
                onChangeText={(v) => setEditing({ ...editing, email: v })}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            )}
            {self || lastManager ? (
              <T size={14} color={colors.muted}>
                {self ? "Você não pode mudar o seu próprio acesso." : "Este é o único gerente: crie outro antes de mudar."}
              </T>
            ) : (
              <>
                <Choice
                  label="Acesso"
                  value={editing.access}
                  options={[
                    { value: "funcionario", label: "Funcionário" },
                    { value: "gerente", label: "Gerente" },
                  ]}
                  onChange={(v) => setEditing({ ...editing, access: v })}
                />
                <T size={14} color={colors.muted}>{ACCESS_TEXT[editing.access]}</T>
              </>
            )}
            <Field
              label={editing.id ? "Nova senha" : "Senha"}
              hint={editing.id ? "Deixe em branco para manter a senha atual. Mínimo de 8 caracteres." : "Mínimo de 8 caracteres. Passe para a pessoa junto com o e-mail."}
              value={editing.password}
              onChangeText={(v) => setEditing({ ...editing, password: v })}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            {editError && <Notice tone="danger">{editError}</Notice>}
            <Button label={editing.id ? "Salvar" : busy ? "Criando…" : "Criar login"} busy={busy} onPress={() => void submitLogin()} />
            <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={[ui.button, { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}>
              <T weight="bold">Cancelar</T>
            </Pressable>
          </ScrollView>
        )}
      </Modal>
    </Page>
  );
}
