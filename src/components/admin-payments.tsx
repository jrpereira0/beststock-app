import { useMemo, useState } from "react";
import { Dialog } from "@/lib/dialog";
import { Modal, ScrollView, View } from "react-native";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { Badge, Choice, DayPicker } from "@/components/widgets";
import { cancelPayment, markPaid, reopenPayment, type PaymentRow } from "@/lib/data-admin";
import { addDays, daysFrom, formatDate, today } from "@/lib/dates";
import { brl, dueText, monthLabel, PAYMENT_METHODS, situation, SITUATION_LABEL } from "@/lib/site/billing";
import type { PaymentMethod } from "@/lib/site/types";
import { colors } from "@/lib/theme";

/**
 * Lista de cobranças, como a do site. Com `admin`, cada uma ganha as ações de registrar pagamento,
 * cancelar e desfazer pagamento. `onChange` é chamado depois de cada ação, para recarregar a tela.
 */
export function PaymentList({
  payments,
  admin = false,
  defaultMethod = "pix",
  onChange,
}: {
  payments: PaymentRow[];
  admin?: boolean;
  defaultMethod?: PaymentMethod;
  onChange?: () => void;
}) {
  const now = today();
  const [paying, setPaying] = useState<PaymentRow | null>(null);

  function confirm(title: string, message: string, label: string, action: () => Promise<string | null>) {
    Dialog.alert(title, message, [
      { text: "Voltar", style: "cancel" },
      {
        text: label,
        style: "destructive",
        onPress: async () => {
          const err = await action();
          if (err) Dialog.alert("Não deu certo", err);
          else onChange?.();
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 10 }}>
      {payments.map((p) => {
        const s = situation(p, now);
        const label = SITUATION_LABEL[s];
        const name = `${p.description} de ${monthLabel(p.reference_month)}`;
        const when =
          p.status === "pago" && p.paid_on
            ? `Pago em ${formatDate(p.paid_on)}${p.method ? ` · ${PAYMENT_METHODS[p.method]}` : ""}`
            : p.status === "cancelado"
              ? `Vencimento era ${formatDate(p.due_date)}`
              : dueText(p.due_date, now).replace(/^v/, "V");
        return (
          <Card key={p.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                {p.storeName ? (
                  <>
                    <T weight="bold">{p.storeName}</T>
                    <T size={14} color={colors.muted}>{name}</T>
                  </>
                ) : (
                  <T weight="semibold">{name}</T>
                )}
                {p.note ? <T size={14} color={colors.muted}>{p.note}</T> : null}
              </View>
              <T weight="extrabold" size={18}>{brl.format(Number(p.amount))}</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge tone={label.tone}>{label.text}</Badge>
              <T size={14} weight={s === "atrasado" ? "semibold" : "regular"} color={s === "atrasado" ? colors.danger : colors.muted}>{when}</T>
            </View>
            {admin && p.status === "pendente" && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Registrar pagamento" variant="dark" style={{ flex: 1, minHeight: 44 }} onPress={() => setPaying(p)} />
                <Button
                  label="Cancelar"
                  variant="danger"
                  style={{ minHeight: 44 }}
                  onPress={() =>
                    confirm("Cancelar esta cobrança?", `${name}, ${brl.format(Number(p.amount))}. Ela continua no histórico como cancelada.`, "Cancelar cobrança", () =>
                      cancelPayment(p.id),
                    )
                  }
                />
              </View>
            )}
            {admin && p.status === "pago" && (
              <Button
                label="Desfazer pagamento"
                variant="secondary"
                style={{ minHeight: 44 }}
                onPress={() =>
                  confirm("Desfazer este pagamento?", `${name} volta a ficar em aberto. Use se o pagamento foi lançado por engano.`, "Desfazer", () =>
                    reopenPayment(p.id),
                  )
                }
              />
            )}
          </Card>
        );
      })}
      {paying && (
        <PayDialog
          payment={paying}
          defaultMethod={defaultMethod}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            onChange?.();
          }}
        />
      )}
    </View>
  );
}

function PayDialog({ payment: p, defaultMethod, onClose, onDone }: { payment: PaymentRow; defaultMethod: PaymentMethod; onClose: () => void; onDone: () => void }) {
  const now = today();
  const [paidOn, setPaidOn] = useState(now);
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [note, setNote] = useState(p.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => daysFrom(addDays(now, -30), now).reverse(), [now]);
  async function save() {
    setBusy(true);
    setError(null);
    const err = await markPaid(p.id, paidOn, method, note);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T weight="extrabold" size={22}>Registrar pagamento</T>
        <T color={colors.muted}>
          {`${p.storeName ? `${p.storeName}: ` : ""}${p.description} de ${monthLabel(p.reference_month)}, ${brl.format(Number(p.amount))}.`}
        </T>
        <T weight="semibold">Data em que foi pago</T>
        <DayPicker value={paidOn} onChange={setPaidOn} days={days} todayIso={now} />
        <Choice
          label="Forma de pagamento"
          value={method}
          options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value: value as PaymentMethod, label }))}
          onChange={setMethod}
        />
        <Field label="Observação" hint="Opcional. Exemplo: número do comprovante" value={note} onChangeText={setNote} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label="Confirmar pagamento" busy={busy} onPress={() => void save()} />
        <Button label="Voltar" variant="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
