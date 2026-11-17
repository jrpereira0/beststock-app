import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert as Dialog, Pressable, View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Badge, Page, Stat } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { deleteMovement, HISTORY_DAYS, loadHistory, type HistoryRow } from "@/lib/data-entradas";
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
  const load = useCallback(() => loadHistory(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh, reload } = useLoad(load);
  const [kind, setKind] = useState<"todos" | "entrada" | "perda">("todos");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const now = today();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const entries = rows.filter((r) => r.kind === "entrada");
  const losses = rows.length - entries.length;
  const value = entries.reduce((a, r) => a + r.value, 0);
  const sinceCount = data?.lastCount ? rows.filter((r) => r.date > (data.lastCount as string)).length : rows.length;
  const byDate = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    for (const r of kind === "todos" ? rows : rows.filter((x) => x.kind === kind)) map.set(r.date, [...(map.get(r.date) ?? []), r]);
    return [...map];
  }, [rows, kind]);

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
      loading={!data}
    >
      <View style={{ gap: 8 }}>
        <Button label="Registrar entrada" onPress={() => router.push("/lancar?tipo=entrada")} />
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
            <Stat
              label="Desde a contagem"
              value={plural(sinceCount, "lançamento", "lançamentos")}
              hint={data?.lastCount ? `Última contagem em ${formatDate(data.lastCount)}` : "Nenhuma contagem fechada ainda"}
            />
          </View>

          {entries.length > 0 && losses > 0 && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(
                [
                  ["todos", "Tudo", rows.length],
                  ["entrada", "Entradas", entries.length],
                  ["perda", "Perdas", losses],
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
            const dayEntries = items.filter((r) => r.kind === "entrada");
            const dayLosses = items.length - dayEntries.length;
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
                      {[dayEntries.length > 0 && plural(dayEntries.length, "entrada", "entradas"), dayLosses > 0 && plural(dayLosses, "perda", "perdas")]
                        .filter(Boolean)
                        .join(" · ")}
                    </T>
                    {manager && dayValue > 0 && <T size={14} color={colors.muted}>{brl.format(dayValue)}</T>}
                  </View>
                </Pressable>
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
                      </View>
                      <Badge tone={r.kind === "entrada" ? "ok" : "danger"}>{KIND[r.kind]}</Badge>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Excluir lançamento de ${r.name}`}
                        onPress={() => remove(r)}
                        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                      >
                        <T weight="bold" size={18} color={colors.danger}>✕</T>
                      </Pressable>
                    </View>
                  ))}
              </Card>
            );
          })}
        </>
      )}
    </Page>
  );
}
