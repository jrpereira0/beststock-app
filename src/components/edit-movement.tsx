import { useMemo, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { Button, Notice, QuantityStepper, T } from "@/components/ui";
import { DayPicker } from "@/components/widgets";
import type { Profile } from "@/lib/auth";
import { HISTORY_DAYS, moveDay, updateMovement, type HistoryRow } from "@/lib/data-entradas";
import { addDays, daysFrom, formatDate, today } from "@/lib/dates";
import { colors } from "@/lib/theme";

const asText = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/** Mudar a data de todos os lançamentos de um dia de uma vez, como no site. */
export function MoveDay({ profile, rows, onClose, onDone }: { profile: Profile; rows: HistoryRow[]; onClose: () => void; onDone: () => void }) {
  const now = today();
  const from = rows[0]?.date ?? now;
  const [date, setDate] = useState(from);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => {
    const list = daysFrom(addDays(now, -HISTORY_DAYS), now).reverse();
    return list.includes(from) ? list : [from, ...list];
  }, [now, from]);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await moveDay(profile, rows.map((r) => r.id), from, date);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T weight="extrabold" size={22}>Mudar a data</T>
        <T color={colors.muted}>
          {rows.length === 1 ? "O lançamento" : `Os ${rows.length} lançamentos`} de {formatDate(from)} vão para o dia escolhido. As quantidades não mudam.
        </T>
        <T weight="semibold">Novo dia</T>
        <DayPicker value={date} onChange={setDate} days={days} todayIso={now} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label="Mudar a data" busy={busy} disabled={date === from} onPress={() => void save()} />
        <Button label="Voltar" variant="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

/** Corrigir a data e a quantidade de um lançamento, como a janela de corrigir do site. */
export function EditMovement({ profile, row, onClose, onDone }: { profile: Profile; row: HistoryRow; onClose: () => void; onDone: () => void }) {
  const now = today();
  const [date, setDate] = useState(row.date);
  const [qty, setQty] = useState(asText(row.edit.amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Do dia de hoje para trás, como ao lançar. O dia atual do lançamento sempre aparece.
  const days = useMemo(() => {
    const list = daysFrom(addDays(now, -HISTORY_DAYS), now).reverse();
    return list.includes(row.date) ? list : [row.date, ...list];
  }, [now, row.date]);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await updateMovement(profile, row.id, date, qty);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <T weight="extrabold" size={22}>Corrigir {row.kind}</T>
        <T color={colors.muted}>{row.name}</T>
        <T weight="semibold">Data</T>
        <DayPicker value={date} onChange={setDate} days={days} todayIso={now} />
        <View style={{ gap: 6 }}>
          <T weight="semibold">
            Quantidade{row.edit.unit ? <T color={colors.muted}> (em {row.edit.unit})</T> : null}
          </T>
          <QuantityStepper label={row.name} value={qty} onChange={setQty} width={96} />
        </View>
        <T size={14} color={colors.muted}>Para trocar o produto, exclua este lançamento e lance de novo.</T>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label="Salvar correção" busy={busy} onPress={() => void save()} />
        <Button label="Voltar" variant="secondary" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
