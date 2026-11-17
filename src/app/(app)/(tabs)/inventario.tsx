import { router } from "expo-router";
import { PaperCount } from "@/components/paper-count";
import { Guide } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { Dialog } from "@/lib/dialog";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { Button, Card, T } from "@/components/ui";
import { Badge, DayPicker, ListLink, Page, Stat } from "@/components/widgets";
import { useProfile } from "@/lib/auth";
import { openTodayCount } from "@/lib/data";
import { loadInventories } from "@/lib/data-inventario";
import { addDays, daysBetween, daysFrom, formatDate, today } from "@/lib/dates";
import { colors } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function InventarioTab() {
  const profile = useProfile();
  const load = useCallback(() => loadInventories(profile), [profile]);
  const { data, fromCache, error, refreshing, refresh } = useLoad(load);
  const now = today();
  const [date, setDate] = useState(now);
  const [opening, setOpening] = useState(false);
  const days = useMemo(() => daysFrom(addDays(now, -13), now).reverse(), [now]);

  const draft = data?.inventories.find((i) => i.status === "draft");
  const closed = data?.inventories.filter((i) => i.status === "closed") ?? [];
  const lastClosed = closed[0];
  const total = data?.productCount ?? 0;
  const done = draft?.counted ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const nextOn = lastClosed ? addDays(lastClosed.counted_on, profile.store.count_interval_days) : null;
  const daysUntil = nextOn ? daysBetween(now, nextOn) : null;
  const nextHint =
    daysUntil === null
      ? "depois da primeira contagem"
      : daysUntil > 1
        ? `daqui a ${daysUntil} dias`
        : daysUntil === 1
          ? "amanhã"
          : daysUntil === 0
            ? "é hoje"
            : `${-daysUntil} ${daysUntil === -1 ? "dia" : "dias"} de atraso`;
  const late = daysUntil !== null && daysUntil < 0;

  async function start() {
    setOpening(true);
    const res = await openTodayCount(profile, date);
    setOpening(false);
    if ("error" in res) Dialog.alert("Não abriu a contagem", res.error);
    else router.push(`/contagem/${res.id}`);
  }

  return (
    <Page
      tab
      title="Inventário"
      subtitle="Conte o estoque e acompanhe as contagens da loja."
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      fromCache={fromCache}
      error={error}
      skeleton="dashboard"
      loading={!data}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat
          label="Última contagem"
          value={lastClosed ? formatDate(lastClosed.counted_on) : "—"}
          hint={lastClosed ? `${lastClosed.counted} produtos` : "ainda não houve"}
          onPress={lastClosed ? () => router.push(`/contagem/${lastClosed.id}`) : undefined}
        />
        <Stat label="Próxima contagem" value={nextOn ? formatDate(nextOn) : "—"} hint={nextHint} tone={late ? "danger" : daysUntil === 0 ? "warn" : "neutral"} />
        <Stat
          label={draft ? "Nesta contagem" : "Produtos ativos"}
          value={draft && total > 0 ? `${done} de ${total}` : total}
          hint={draft ? `${percent}% concluído` : `a cada ${profile.store.count_interval_days} dias`}
          tone={draft && total > 0 && done >= total ? "ok" : "neutral"}
        />
      </View>

      <Guide guide={GUIDES.inventario} />

      {draft ? (
        <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 20, gap: 8 }}>
          <T weight="bold" size={13} color={colors.brand} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Em andamento</T>
          <T weight="extrabold" size={24} color="#fff">Contagem de {formatDate(draft.counted_on)}</T>
          <T color="rgba(255,255,255,0.75)">
            {total > 0 && done >= total
              ? "Todos os produtos foram contados. Revise os números e feche quando estiver pronto."
              : "O que você já digitou está salvo. Pode parar e continuar depois."}
          </T>
          {total > 0 && (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden", marginTop: 4 }}>
              <View style={{ height: "100%", width: `${percent}%`, backgroundColor: colors.brand }} />
            </View>
          )}
          <Button label="Continuar contagem" onPress={() => router.push(`/contagem/${draft.id}`)} style={{ marginTop: 8 }} />
        </View>
      ) : (
        <Card style={{ gap: 10 }}>
          <T weight="bold" size={13} color={late ? colors.danger : colors.brandText} style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {late ? "Contagem atrasada" : daysUntil === 0 ? "Dia de contagem" : "Nova contagem"}
          </T>
          <T weight="extrabold" size={22}>
            {late ? `Atrasada ${-(daysUntil ?? 0)} ${daysUntil === -1 ? "dia" : "dias"}` : daysUntil === 0 ? "Conte o estoque hoje" : "Iniciar uma contagem"}
          </T>
          <T color={colors.muted}>
            {lastClosed
              ? `A última foi em ${formatDate(lastClosed.counted_on)}. Escolha o dia desta contagem. Dá para parar e continuar depois.`
              : "A primeira contagem mostra o que há hoje. A partir da segunda, o sistema calcula o consumo."}
          </T>
          <T weight="semibold">Data da contagem</T>
          <DayPicker value={date} onChange={setDate} days={days} todayIso={now} />
          <Button label={opening ? "Abrindo…" : "Iniciar contagem"} busy={opening} onPress={() => void start()} />
        </Card>
      )}

      {/* Para quem prefere contar no papel e digitar depois. */}
      <PaperCount />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1 }}>Histórico</T>
        {closed.length > 0 && <T size={14} color={colors.muted}>{closed.length} {closed.length === 1 ? "fechada" : "fechadas"}</T>}
      </View>
      {closed.length === 0 ? (
        <Card style={{ alignItems: "center", paddingVertical: 28, gap: 4 }}>
          <T weight="bold">{draft ? "Nenhuma contagem fechada" : "Nenhuma contagem ainda"}</T>
          <T color={colors.muted} style={{ textAlign: "center" }}>
            {draft
              ? "Quando você fechar a contagem em andamento, ela fica registrada aqui."
              : "A primeira contagem mostra o que há no estoque hoje. A partir da segunda, o sistema calcula o consumo."}
          </T>
        </Card>
      ) : (
        closed.map((inv) => (
          <ListLink
            key={inv.id}
            title={formatDate(inv.counted_on)}
            subtitle={`${inv.counted} ${inv.counted === 1 ? "produto contado" : "produtos contados"}`}
            onPress={() => router.push(`/contagem/${inv.id}`)}
            right={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Badge tone="ok">Fechado</Badge>
              </View>
            }
          />
        ))
      )}
    </Page>
  );
}

