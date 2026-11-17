import { Stack, useLocalSearchParams } from "expo-router";
import { Dialog } from "@/lib/dialog";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { PaymentList } from "@/components/admin-payments";
import { BillingFields, emptyBilling } from "@/components/billing-fields";
import { NewPayment } from "@/components/new-payment";
import { StoreFieldsForm } from "@/components/store-fields";
import { StoreLogins } from "@/components/store-logins";
import { Button, Card, Field, Notice, SectionTitle, T } from "@/components/ui";
import { Badge, Page, Stat, Toggle } from "@/components/widgets";
import { useAdmin } from "@/lib/auth";
import {
  addStoreLogin,
  blockStore,
  loadStore,
  plansFor,
  removeStoreLogin,
  sendAnnouncement,
  unblockStore,
  updateBilling,
  updateStoreData,
  updateStoreLogin,
  type StoreDetail,
  type StoreFields,
} from "@/lib/data-admin";
import { formatDate, today } from "@/lib/dates";
import { addMonths, brl, monthLong, nextChargeDate, PAYMENT_METHODS, planPrice, planTitle, situation } from "@/lib/site/billing";
import type { Payment } from "@/lib/site/types";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const TABS = [
  { key: "resumo", label: "Resumo" },
  { key: "plano", label: "Plano" },
  { key: "cobranca", label: "Cobranças" },
  { key: "cadastro", label: "Cadastro" },
  { key: "acesso", label: "Acesso" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** Ficha da unidade, como admin/lojas/[id] do site. */
export default function LojaScreen() {
  const { id, aba, criada } = useLocalSearchParams<{ id: string; aba?: string; criada?: string }>();
  const load = useCallback(() => loadStore(id), [id]);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(load);
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === aba) ? (aba as TabKey) : "resumo");
  return (
    <Page refreshing={refreshing} onRefresh={() => void refresh()} fromCache={fromCache} error={error} loading={!data} skeleton="dashboard">
      <Stack.Screen options={{ title: data?.store.name ?? "Unidade" }} />
      {data && <Detail data={data} tab={tab} setTab={setTab} created={criada === "1"} reload={() => void reload()} />}
    </Page>
  );
}

function Detail({ data, tab, setTab, created, reload }: { data: StoreDetail; tab: TabKey; setTab: (t: TabKey) => void; created: boolean; reload: () => void }) {
  const me = useAdmin();
  const { store, payments } = data;
  const now = today();
  const plans = plansFor(data.plans, store);
  const plan = plans.find((p) => p.id === store.plan_id);
  const charged = store.billing_active && plan ? plan : null;
  const paused = !store.billing_active && plan ? plan : null;
  const open = payments.filter((p) => p.status === "pendente");
  const overdue = open.filter((p) => situation(p, now) === "atrasado");
  const total = (list: Payment[]) => list.reduce((a, p) => a + Number(p.amount), 0);
  const paid = payments.filter((p) => p.status === "pago");
  const nextCharge = nextChargeDate(store, plan, now);
  const lastCharged = payments.filter((p) => p.recurring).map((p) => p.reference_month.slice(0, 7)).sort().at(-1);
  const chargedUntil = lastCharged && plan ? addMonths(lastCharged, plan.duration_months) : null;
  const login = data.logins.find((l) => l.access === "gerente")?.email ?? data.logins[0]?.email ?? "não encontrado";
  const [blocking, setBlocking] = useState(false);

  function unblock() {
    Dialog.alert("Reativar esta unidade?", "A unidade volta a entrar no sistema com o mesmo login e os mesmos dados.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Reativar",
        onPress: async () => {
          const err = await unblockStore(store.id);
          if (err) Dialog.alert("Não reativou", err);
          else reload();
        },
      },
    ]);
  }

  return (
    <>
      <View style={{ gap: 6 }}>
        <T weight="extrabold" size={24}>{store.name}</T>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={store.active ? "ok" : "off"}>{store.active ? "Ativa" : "Bloqueada"}</Badge>
          {overdue.length > 0 && <Badge tone="danger">{`Deve ${brl.format(total(overdue))}`}</Badge>}
          <T size={14} color={colors.muted}>{[store.city, store.owner_name, store.phone].filter(Boolean).join(" · ")}</T>
        </View>
      </View>
      {store.active ? (
        <Button label="Bloquear unidade" variant="danger" onPress={() => setBlocking(true)} />
      ) : (
        <Button label="Reativar unidade" onPress={unblock} />
      )}
      {created && (
        <Notice tone="ok" title="Unidade criada">
          {`Passe o login ${login} e a senha que você definiu para o responsável.${
            charged && nextCharge
              ? ` ${planTitle(charged.name)}: ${planPrice(charged)}, com vencimento no dia ${store.due_day}. A primeira cobrança sai em ${monthLong(store.billing_start ?? "")}.`
              : " Esta unidade está sem cobrança."
          }`}
        </Notice>
      )}
      {!store.active && (
        <Notice tone="danger" title="Unidade bloqueada">
          {`${store.blocked_reason || "Sem motivo registrado."}${store.blocked_at ? ` Bloqueada em ${formatDate(store.blocked_at.slice(0, 10))}.` : ""}`}
        </Notice>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)}
            style={{ minHeight: 46, paddingHorizontal: 14, justifyContent: "center", borderBottomWidth: 3, borderBottomColor: tab === t.key ? colors.brand : "transparent", flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <T weight={tab === t.key ? "bold" : "semibold"} color={tab === t.key ? colors.ink : colors.muted}>{t.label}</T>
            {t.key === "cobranca" && overdue.length > 0 && (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                <T weight="extrabold" size={11} color="#fff">{String(overdue.length)}</T>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {tab === "resumo" && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat
              label="Em atraso"
              value={overdue.length ? brl.format(total(overdue)) : "Nada"}
              tone={overdue.length ? "danger" : "ok"}
              hint={overdue.length ? `${overdue.length} ${overdue.length === 1 ? "cobrança" : "cobranças"}` : "Em dia"}
              onPress={() => setTab("cobranca")}
            />
            <Stat
              label="Plano"
              value={charged ? charged.name : "Sem cobrança"}
              hint={charged && nextCharge ? `${planPrice(charged)} · próxima em ${formatDate(nextCharge)}` : "Escolha o plano para cobrar"}
              onPress={() => setTab("plano")}
            />
            <Stat label="Total já pago" value={brl.format(total(paid))} onPress={() => setTab("cobranca")} />
            <Stat label="Última contagem" value={data.lastCount ? formatDate(data.lastCount) : "Nenhuma"} hint={`${data.products} produtos ativos`} />
          </View>
          <SectionTitle>Últimas cobranças</SectionTitle>
          {payments.length === 0 ? (
            <Card style={{ paddingVertical: 20 }}>
              <T color={colors.muted} style={{ textAlign: "center" }}>
                {charged ? `A primeira cobrança do plano aparece em ${monthLong(store.billing_start ?? "")}.` : "Esta unidade está sem cobrança. Escolha o plano dela na seção Plano."}
              </T>
            </Card>
          ) : (
            <>
              <PaymentList payments={payments.slice(0, 3)} />
              <Button label="Ver todas e registrar pagamento" variant="secondary" onPress={() => setTab("cobranca")} />
            </>
          )}
          <SectionTitle>Enviar aviso para esta unidade</SectionTitle>
          <AnnouncementForm storeId={store.id} />
        </>
      )}

      {tab === "plano" && (
        <>
          <Card style={{ gap: 6 }}>
            <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Situação hoje</T>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <T weight="extrabold" size={22} style={{ flex: 1 }}>{charged ? planTitle(charged.name) : paused ? "Cobrança pausada" : "Sem cobrança"}</T>
              <Badge tone={charged ? "ok" : paused ? "warn" : "off"}>{charged ? "Cobrança ligada" : paused ? "Pausada" : "Desligada"}</Badge>
            </View>
            <T color={colors.muted}>
              {charged
                ? `${planPrice(charged)}. O sistema cria cada cobrança sozinho.`
                : paused
                  ? `O plano escolhido é ${paused.name}, mas nenhuma cobrança nova está sendo criada.`
                  : "Esta unidade usa o sistema sem pagar. Para cobrar, escolha um plano abaixo."}
            </T>
            {charged && nextCharge && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 4 }}>
                <T>{`Próxima cobrança: ${formatDate(nextCharge)} · ${brl.format(Number(charged.price))}`}</T>
                <T>{`Vencimento: dia ${store.due_day} · ${PAYMENT_METHODS[store.payment_method]}`}</T>
                <T>{`Cobrando desde ${monthLong(store.billing_start ?? "")}`}</T>
              </View>
            )}
          </Card>
          <BillingEditor data={data} plans={plans} chargedUntil={chargedUntil} onSaved={reload} title={charged ? "Alterar o plano, o vencimento ou pausar" : "Ligar a cobrança desta unidade"} />
        </>
      )}

      {tab === "cobranca" && <PaymentsTab data={data} charged={Boolean(charged)} nextCharge={nextCharge} onChange={reload} goPlan={() => setTab("plano")} />}

      {tab === "cadastro" && <StoreDataForm data={data} onSaved={reload} />}

      {tab === "acesso" && (
        <Card style={{ gap: 10 }}>
          <T weight="extrabold" size={18}>Logins da unidade</T>
          <T size={14} color={colors.muted}>
            {store.active
              ? "Cada pessoa entra com o próprio e-mail. O gerente da loja também cria e remove logins em Configurações. Se alguém esqueceu a senha, toque em Editar e defina uma nova."
              : "A unidade está bloqueada: nenhum desses logins consegue entrar, mesmo com a senha certa."}
          </T>
          <StoreLogins
            logins={data.logins}
            selfId={me.id}
            storeName={store.name}
            onAdd={(f) => addStoreLogin(store.id, f)}
            onUpdate={(f) => updateStoreLogin(store.id, f)}
            onRemove={(loginId) => removeStoreLogin(store.id, loginId)}
            onChanged={reload}
          />
        </Card>
      )}

      {blocking && (
        <BlockDialog
          storeId={store.id}
          billingActive={store.billing_active}
          suggested={overdue.length ? "Cobrança em atraso" : ""}
          onClose={() => setBlocking(false)}
          onDone={() => {
            setBlocking(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function PaymentsTab({ data, charged, nextCharge, onChange, goPlan }: { data: StoreDetail; charged: boolean; nextCharge: string | null; onChange: () => void; goPlan: () => void }) {
  const { store, payments } = data;
  const now = today();
  const [creating, setCreating] = useState(false);
  const open = payments.filter((p) => p.status === "pendente");
  const overdue = open.filter((p) => situation(p, now) === "atrasado");
  const paid = payments.filter((p) => p.status === "pago");
  const total = (list: Payment[]) => list.reduce((a, p) => a + Number(p.amount), 0);
  const plan = data.plans.find((p) => p.id === store.plan_id);
  return (
    <>
      {!charged && (
        <Notice title="Esta unidade está sem cobrança automática">
          Para o sistema criar as cobranças sozinho, escolha o plano da unidade na seção Plano. Cobranças avulsas podem ser lançadas a qualquer momento.
        </Notice>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat
          label="Em atraso"
          value={overdue.length ? brl.format(total(overdue)) : "Nada"}
          tone={overdue.length ? "danger" : "ok"}
          hint={overdue.length ? `${overdue.length} ${overdue.length === 1 ? "cobrança vencida" : "cobranças vencidas"}` : "Em dia"}
        />
        <Stat
          label="Para receber"
          value={open.length ? brl.format(total(open)) : "Nada"}
          hint={open.length ? `${open.length} ${open.length === 1 ? "cobrança sem pagamento" : "cobranças sem pagamento"}` : "Nada pendente"}
        />
        <Stat label="Já recebido" value={brl.format(total(paid))} hint={`${paid.length} ${paid.length === 1 ? "pagamento registrado" : "pagamentos registrados"}`} />
        <Stat
          label="Próxima automática"
          value={charged && nextCharge ? formatDate(nextCharge) : "Nenhuma"}
          hint={charged && plan ? `${brl.format(Number(plan.price))} · ${plan.name}` : "Sem plano ligado"}
          onPress={goPlan}
        />
      </View>
      <T size={14} color={colors.muted}>Quando a unidade pagar, toque em Registrar pagamento. A forma de pagamento usual dela é {PAYMENT_METHODS[store.payment_method]}.</T>
      <Button label="Cobrança avulsa" variant="secondary" onPress={() => setCreating(true)} />
      {payments.length === 0 ? (
        <Card style={{ paddingVertical: 20 }}>
          <T color={colors.muted} style={{ textAlign: "center" }}>
            {charged && nextCharge ? `Nenhuma cobrança ainda. A primeira aparece aqui sozinha, com vencimento em ${formatDate(nextCharge)}.` : "Nenhuma cobrança ainda."}
          </T>
        </Card>
      ) : (
        <PaymentList payments={payments} admin defaultMethod={store.payment_method} onChange={onChange} />
      )}
      {creating && (
        <NewPayment
          storeId={store.id}
          defaultMonth={now.slice(0, 7)}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            onChange();
          }}
        />
      )}
    </>
  );
}

function BillingEditor({ data, plans, chargedUntil, onSaved, title }: { data: StoreDetail; plans: StoreDetail["plans"]; chargedUntil: string | null; onSaved: () => void; title: string }) {
  const [value, setValue] = useState(() => emptyBilling(data.store, plans));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await updateBilling(data.store.id, value);
    setBusy(false);
    if (!res.ok) return setMessage({ tone: "danger", text: res.error });
    setMessage({ tone: "ok", text: res.data.ok ?? "Cobrança salva." });
    onSaved();
  }
  return (
    <Card style={{ gap: 14 }}>
      <T weight="extrabold" size={18}>{title}</T>
      <T size={14} color={colors.muted}>Responda às perguntas e confira o resumo no final. Nada muda até você tocar em Salvar.</T>
      <BillingFields value={value} onChange={setValue} store={data.store} plans={plans} today={today()} chargedUntil={chargedUntil} />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {plans.length > 0 && <Button label="Salvar" busy={busy} onPress={() => void save()} />}
    </Card>
  );
}

function StoreDataForm({ data, onSaved }: { data: StoreDetail; onSaved: () => void }) {
  const s = data.store;
  const [f, setF] = useState<StoreFields>({
    name: s.name,
    city: s.city ?? "",
    address: s.address ?? "",
    document: s.document ?? "",
    count_interval_days: String(s.count_interval_days),
    owner_name: s.owner_name ?? "",
    phone: s.phone ?? "",
    notes: data.notes,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const set = (key: keyof StoreFields, value: string) => setF((x) => ({ ...x, [key]: value }));
  async function save() {
    setBusy(true);
    setMessage(null);
    const err = await updateStoreData(s.id, f);
    setBusy(false);
    if (err) return setMessage({ tone: "danger", text: err });
    setMessage({ tone: "ok", text: "Cadastro salvo." });
    onSaved();
  }
  return (
    <>
      <StoreFieldsForm value={f} set={set} />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button label="Salvar cadastro" busy={busy} onPress={() => void save()} />
    </>
  );
}

function AnnouncementForm({ storeId }: { storeId: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  async function send() {
    setBusy(true);
    setMessage(null);
    const err = await sendAnnouncement({ store_id: storeId, title, body, important });
    setBusy(false);
    if (err) return setMessage({ tone: "danger", text: err });
    setTitle("");
    setBody("");
    setImportant(false);
    setMessage({ tone: "ok", text: "Aviso enviado. Aparece no sino da unidade." });
  }
  return (
    <Card style={{ gap: 12 }}>
      <Field label="Título" value={title} onChangeText={setTitle} />
      <Field label="Mensagem" value={body} onChangeText={setBody} multiline style={{ minHeight: 80, textAlignVertical: "top", paddingTop: 12 }} />
      <Toggle label="Marcar como importante" value={important} onChange={setImportant} />
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Button label={busy ? "Enviando…" : "Enviar aviso"} busy={busy} onPress={() => void send()} />
    </Card>
  );
}

function BlockDialog({ storeId, billingActive, suggested, onClose, onDone }: { storeId: string; billingActive: boolean; suggested: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(suggested);
  const [pause, setPause] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    const err = await blockStore(storeId, reason, pause);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T weight="extrabold" size={22}>Bloquear esta unidade?</T>
        <T color={colors.muted}>A unidade deixa de conseguir entrar no sistema. Os dados dela ficam guardados e voltam ao reativar.</T>
        <Field label="Motivo do bloqueio" hint="Fica registrado na ficha da unidade" value={reason} onChangeText={setReason} />
        {billingActive && (
          <Toggle label="Pausar a cobrança durante o bloqueio" hint="Sem marcar, as cobranças do plano continuam sendo geradas." value={pause} onChange={setPause} />
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label={busy ? "Bloqueando…" : "Bloquear unidade"} variant="danger" busy={busy} onPress={() => void save()} />
        <Button label="Voltar" variant="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

