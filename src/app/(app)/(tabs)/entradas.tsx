import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { EditMovement, MoveDay } from "@/components/edit-movement";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { Dialog } from "@/lib/dialog";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Badge, Page, Stat } from "@/components/widgets";
import { useAuth, useProfile } from "@/lib/auth";
import { deleteMovement, HISTORY_DAYS, loadHistory, type HistoryRow } from "@/lib/data-entradas";
import { deleteTransfer } from "@/lib/data-lojas";
import { daysBetween, formatDate, formatQty, today } from "@/lib/dates";
import { brl } from "@/lib/site/billing";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const KIND = { entrada: "Entrada", perda: "Perda" } as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const ago = (days: number) => (days <= 0 ? "Hoje" : days === 1 ? "Ontem" : `Há ${days} dias`);

export default function EntradasTab() {
  const profile = useProfile();
  const manager = profile.access === "gerente";
  const { stores } = useAuth();
  const load = useCallback(() => loadHistory(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(load);
  const [kind, setKind] = useState<"todos" | "entrada" | "perda" | "transferencia">("todos");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<HistoryRow | null>(null);
  const [moving, setMoving] = useState<HistoryRow[] | null>(null);
  const now = today();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  // Transferência não é compra nem perda: fica fora destes números e tem a própria contagem.
  const entries = rows.filter((r) => r.kind === "entrada" && !r.transfer);
  const losses = rows.filter((r) => r.kind === "perda" && !r.transfer).length;
  const transfers = rows.filter((r) => r.transfer).length;
  const value = entries.reduce((a, r) => a + r.value, 0);
  const sinceCount = data?.lastCount ? rows.filter((r) => r.date > (data.lastCount as string)).length : rows.length;
  const byDate = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    const kindOf = (r: HistoryRow) => (r.transfer ? "transferencia" : r.kind);
    for (const r of kind === "todos" ? rows : rows.filter((x) => kindOf(x) === kind)) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return [...map];
  }, [rows, kind]);

  function undoTransfer(r: HistoryRow) {
    if (!r.transfer) return;
    Dialog.alert(
      "Desfazer esta transferência?",
      `A transferência de ${formatDate(r.date)} ${r.kind === "entrada" ? "da" : "para a"} loja ${r.transfer.other} é desfeita inteira, com todos os produtos dela, nas duas lojas.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desfazer",
          style: "destructive",
          onPress: async () => {
            const err = await deleteTransfer(r.transfer!.id);
            if (err) Dialog.alert("Não desfez", err);
            else void reload();
          },
        },
      ],
    );
  }

  function remove(r: HistoryRow) {
    Dialog.alert("Excluir este lançamento?", `${KIND[r.kind]} de ${r.name} em ${formatDate(r.date)}.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const err = await deleteMovement(profile, r.id);
          if (err) Dialog.alert("Não excluiu", err);
          else void reload();
        },
      },
    ]);
  }

  return (
    <Page
      tab
      title="Entradas e perdas"
      subtitle="Registre o que chegou de compra e o que foi perdido entre uma contagem e outra."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      skeleton="dashboard"
      loading={!data}
    >
      <View style={{ gap: 8 }}>
        <Button label="Registrar entrada" onPress={() => router.push("/lancar?tipo=entrada")} />
        {manager && stores.length > 1 && <Button label="Transferir para outra loja" variant="secondary" onPress={() => router.push("/transferir")} />}
        <Button label="Entrada pela nota fiscal" variant="secondary" onPress={() => router.push("/nota")} />
        <Button label="Registrar perda" variant="secondary" onPress={() => router.push("/lancar?tipo=perda")} />
      </View>

      {rows.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 28, gap: 4 }}>
          <T weight="bold">Nenhum lançamento ainda</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>
            Quando chegar mercadoria, registre aqui. Sem as entradas, o consumo calculado fica menor do que o real.
          </T>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Stat label="Entradas" value={entries.length} hint={`Produtos lançados em ${HISTORY_DAYS} dias`} />
            <Stat label="Perdas" value={losses} hint={losses > 0 ? `Produtos lançados em ${HISTORY_DAYS} dias` : "Nenhuma perda lançada"} />
            {manager && (
              <Stat
                label="Valor das entradas"
                value={value > 0 ? brl.format(value) : "—"}
                hint={value > 0 ? "Pelo custo cadastrado dos produtos" : "Cadastre o custo dos produtos para ver"}
              />
            )}
            {transfers > 0 && <Stat label="Transferências" value={transfers} hint={`Entre as suas lojas, em ${HISTORY_DAYS} dias`} />}
            <Stat
              label="Desde a contagem"
              value={plural(sinceCount, "lançamento", "lançamentos")}
              hint={data?.lastCount ? `Última contagem em ${formatDate(data.lastCount)}` : "Nenhuma contagem fechada ainda"}
            />
          </View>

          <Guide guide={GUIDES.entradas} />

          {(entries.length > 0 ? 1 : 0) + (losses > 0 ? 1 : 0) + (transfers > 0 ? 1 : 0) > 1 && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(
                [
                  ["todos", "Tudo", rows.length],
                  ["entrada", "Entradas", entries.length],
                  ["perda", "Perdas", losses],
                  ...(transfers > 0 ? ([["transferencia", "Transferências", transfers]] as const) : []),
                ] as const
              ).map(([key, label, count]) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === key }}
                  onPress={() => setKind(key)}
                  style={{
                    minHeight: 40,
                    paddingHorizontal: 14,
                    borderRadius: 20,
                    justifyContent: "center",
                    backgroundColor: kind === key ? colors.ink : colors.card,
                    borderWidth: 1,
                    borderColor: kind === key ? colors.ink : colors.line,
                  }}
                >
                  <T weight="semibold" size={15} color={kind === key ? "#fff" : colors.ink}>
                    {label} {count}
                  </T>
                </Pressable>
              ))}
            </View>
          )}

          <T size={14} color={colors.muted}>
            Lançamentos dos últimos {HISTORY_DAYS} dias, do mais recente para o mais antigo. Toque em um dia para abrir.
          </T>
          {byDate.map(([date, list], i) => {
            const items = [...list].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "pt-BR"));
            const dayEntries = items.filter((r) => r.kind === "entrada" && !r.transfer);
            const dayLosses = items.filter((r) => r.kind === "perda" && !r.transfer).length;
            const dayTransfers = items.filter((r) => r.transfer).length;
            // O que muda de data de uma vez: os lançamentos comuns (a transferência anda inteira, não se move).
            const movable = items.filter((r) => !r.transfer);
            const dayValue = dayEntries.reduce((a, r) => a + r.value, 0);
            const isOpen = open[date] ?? i === 0;
            return (
              <Card key={date} style={{ padding: 0, overflow: "hidden" }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => setOpen((o) => ({ ...o, [date]: !isOpen }))}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}
                >
                  <T weight="bold" size={18} color={colors.muted}>{isOpen ? "▾" : "▸"}</T>
                  <View style={{ flex: 1 }}>
                    <T weight="extrabold" size={18}>{formatDate(date)}</T>
                    <T size={14} color={colors.muted}>
                      {WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} · {ago(daysBetween(date, now))}
                    </T>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <T weight="bold" size={14}>
                      {[dayEntries.length > 0 && plural(dayEntries.length, "entrada", "entradas"), dayLosses > 0 && plural(dayLosses, "perda", "perdas"), dayTransfers > 0 && plural(dayTransfers, "transferência", "transferências")]
                        .filter(Boolean)
                        .join(" · ")}
                    </T>
                    {manager && dayValue > 0 && <T size={14} color={colors.muted}>{brl.format(dayValue)}</T>}
                  </View>
                </Pressable>
                {isOpen && movable.length > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMoving(movable)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, minHeight: 44, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.line }}
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.ink} />
                    <T weight="semibold" size={15} style={{ textDecorationLine: "underline" }}>
                      {movable.length === 1 ? "Mudar a data" : `Mudar a data dos ${movable.length}`}
                    </T>
                  </Pressable>
                )}
                {isOpen &&
                  items.map((r) => (
                    <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T weight="semibold">{r.name}</T>
                        <T size={14} color={colors.muted}>
                          {formatQty(r.amount)} {r.unit}
                          {r.equals ? ` = ${r.equals}` : ""}
                          {r.category ? ` · ${r.category}` : ""}
                          {r.by ? ` · por ${r.by}` : ""}
                          {manager && r.value > 0 ? ` · ${brl.format(r.value)}` : ""}
                        </T>
                        {r.transfer && (
                          <T size={14} weight="semibold">{r.kind === "entrada" ? `Veio da loja ${r.transfer.other}` : `Foi para a loja ${r.transfer.other}`}</T>
                        )}
                      </View>
                      {r.transfer ? <Badge tone="info">Transferência</Badge> : <Badge tone={r.kind === "entrada" ? "ok" : "danger"}>{KIND[r.kind]}</Badge>}
                      {r.transfer ? (
                        // Os dois lados da transferência andam juntos: só dá para desfazer a transferência inteira (o gerente).
                        manager && (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Desfazer a transferência de ${r.name}`}
                            onPress={() => undoTransfer(r)}
                            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="trash-outline" size={20} color={colors.danger} />
                          </Pressable>
                        )
                      ) : (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Corrigir lançamento de ${r.name}`}
                            onPress={() => setEditing(r)}
                            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="pencil" size={20} color={colors.muted} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Excluir lançamento de ${r.name}`}
                            onPress={() => remove(r)}
                            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                          >
                            <Ionicons name="trash-outline" size={20} color={colors.danger} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  ))}
              </Card>
            );
          })}
        </>
      )}
      {moving && (
        <MoveDay
          profile={profile}
          rows={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            void reload();
          }}
        />
      )}
      {editing && (
        <EditMovement
          profile={profile}
          row={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </Page>
  );
}
