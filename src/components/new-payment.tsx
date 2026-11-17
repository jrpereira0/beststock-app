import { useMemo, useState } from "react";
import { Modal, ScrollView } from "react-native";
import { Button, Field, Notice, T } from "@/components/ui";
import { Choice, DayPicker } from "@/components/widgets";
import { createPayment } from "@/lib/data-admin";
import { addDays, daysFrom, today } from "@/lib/dates";
import { addMonths, monthLabel } from "@/lib/site/billing";
import { colors } from "@/lib/theme";

/** Cobrança avulsa (taxa de adesão, multa ou outro valor fora do plano), como no site. */
export function NewPayment({
  stores,
  storeId,
  defaultMonth,
  onClose,
  onDone,
}: {
  /** Sem `storeId`, a pessoa escolhe a unidade. */
  stores?: { id: string; name: string }[];
  storeId?: string;
  defaultMonth: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const now = today();
  const [store, setStore] = useState(storeId ?? "");
  const [description, setDescription] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => Array.from({ length: 9 }, (_, i) => addMonths(now.slice(0, 7), 2 - i)), [now]);
  const dueDays = useMemo(() => daysFrom(addDays(now, -15), addDays(now, 45)), [now]);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await createPayment({ store_id: store, description, reference_month: month, amount, due_date: due });
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T weight="extrabold" size={22}>Cobrança avulsa</T>
        <T color={colors.muted}>Para taxa de adesão, multa ou outro valor fora do plano. A cobrança do plano o sistema cria sozinho.</T>
        {!storeId && stores && <Choice label="Unidade" value={store} options={stores.map((s) => ({ value: s.id, label: s.name }))} onChange={setStore} />}
        <Field label="Descrição" placeholder="Exemplo: Taxa de adesão" value={description} onChangeText={setDescription} />
        <Choice label="Mês de referência" value={month} options={months.map((m) => ({ value: m, label: monthLabel(`${m}-01`) }))} onChange={setMonth} />
        <Field label="Valor (R$)" placeholder="0,00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <T weight="semibold">Vencimento</T>
        <DayPicker value={due} onChange={setDue} days={dueDays} todayIso={now} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label="Criar cobrança" busy={busy} onPress={() => void save()} />
        <Button label="Voltar" variant="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
