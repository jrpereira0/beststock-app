import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dialog } from "@/lib/dialog";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ClosedCount } from "@/components/closed-count";
import { PageSkeleton } from "@/components/skeleton";
import { Button, Notice, T, styles as ui } from "@/components/ui";
import { useProfile } from "@/lib/auth";
import {
  categoriesOf,
  countWarnings,
  groupProducts,
  isZero,
  step,
  stockoutRange,
  type CountProduct,
} from "@/lib/count-rules";
import { closeInventory, discardInventory, fillMissingWithZero, loadCount, Offline, saveCount, type CountData } from "@/lib/data";
import { daysFrom, formatDate, formatDay, formatQty, weekday } from "@/lib/dates";
import { onReconnect, useOnline } from "@/lib/network";
import { flushQueue, readQueue, removeIfSame, writeQueue, type Pending, type PendingItem } from "@/lib/queue";
import { colors, font } from "@/lib/theme";

type Status = "saving" | "saved" | "queued" | "error";

export default function CountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile();
  const [data, setData] = useState<CountData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    loadCount(profile, id)
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setFromCache(res.fromCache);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(
          e instanceof Offline
            ? "Sem internet, e esta contagem ainda não foi aberta neste aparelho. Conecte o celular e abra de novo."
            : e instanceof Error
              ? e.message
              : "Não foi possível abrir a contagem.",
        );
      });
    return () => {
      alive = false;
    };
  }, [id, profile, version]);

  if (loadError) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        <Notice tone="danger">{loadError}</Notice>
        <Button label="Voltar ao início" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  if (!data) {
    return (
      <PageSkeleton title={false} variant="count" />
    );
  }
  if (data.inventory.status !== "draft") {
    return (
      <ClosedCount
        id={data.inventory.id}
        onReopened={() => {
          setData(null);
          setVersion((v) => v + 1);
        }}
      />
    );
  }
  return <CountList data={data} fromCache={fromCache} />;
}

function CountList({ data, fromCache }: { data: CountData; fromCache: boolean }) {
  const profile = useProfile();
  const online = useOnline();
  const inventoryId = data.inventory.id;
  const countedOn = data.inventory.counted_on;
  const staff = profile.access === "funcionario";

  const [values, setValues] = useState<Record<string, string>>(data.initial);
  const [saved, setSaved] = useState<Record<string, string>>(data.initial);
  const [stockouts, setStockouts] = useState<Record<string, string>>(data.stockouts);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [message, setMessage] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<Pending>({});
  const queueRef = useRef<Pending>({});
  const flushing = useRef(false);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const stockoutsRef = useRef(stockouts);
  useEffect(() => {
    stockoutsRef.current = stockouts;
  }, [stockouts]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState<"zero" | "close" | null>(null);
  const [closeError, setCloseError] = useState("");
  const list = useRef<SectionList<CountProduct>>(null);

  // Produto guardado como vazio na fila ("apagar a contagem") não conta como contado.
  const counted = (pid: string) => (queue[pid] ? queue[pid].value.trim() !== "" : (saved[pid] ?? "").trim() !== "");
  const countedTotal = data.products.filter((p) => counted(p.id)).length;
  const missing = data.products.length - countedTotal;
  const percent = data.products.length ? Math.round((countedTotal / data.products.length) * 100) : 0;
  const pendingCount = Object.keys(queue).length;

  const sections = useMemo(
    () =>
      groupProducts(data.products, { search, category, keep: onlyMissing ? (p) => !counted(p.id) : undefined }).map(([title, items]) => ({
        title,
        data: items,
      })),
    // Com "só o que falta", a lista não muda a cada número digitado: só quando a pessoa liga o filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.products, search, category, onlyMissing],
  );
  const categories = useMemo(() => categoriesOf(data.products), [data.products]);

  const updateQueue = useCallback(
    async (change: (q: Pending) => Pending) => {
      queueRef.current = change(queueRef.current);
      setQueue(queueRef.current);
      await writeQueue(AsyncStorage, inventoryId, queueRef.current).catch(() => undefined);
    },
    [inventoryId],
  );

  const sendOne = useCallback((pid: string, item: PendingItem) => saveCount(profile, data, pid, item.value, item.stockout), [profile, data]);

  /** Manda o que está guardado no aparelho, um por um, até a internet falhar de novo. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    // Sem internet com certeza: nem tenta, fica tudo guardado.
    if (!onlineRef.current) {
      setStatus((s) => ({ ...s, ...Object.fromEntries(Object.keys(queueRef.current).map((pid) => [pid, "queued" as Status])) }));
      return;
    }
    flushing.current = true;
    try {
      // Pega o que entrou na fila durante o envio também.
      for (let round = 0; round < 5 && Object.keys(queueRef.current).length > 0; round++) {
        const snapshot = queueRef.current;
        for (const pid of Object.keys(snapshot)) setStatus((s) => ({ ...s, [pid]: "saving" }));
        const finished = await flushQueue(snapshot, sendOne, async (pid, item, res) => {
          await updateQueue((q) => removeIfSame(q, pid, item));
          if (res.ok) {
            setSaved((s) => ({ ...s, [pid]: item.value }));
            setStatus((s) => ({ ...s, [pid]: queueRef.current[pid] ? "queued" : "saved" }));
          } else {
            setMessage((m) => ({ ...m, [pid]: res.error }));
            setStatus((s) => ({ ...s, [pid]: "error" }));
          }
        });
        if (!finished) {
          setStatus((s) => ({ ...s, ...Object.fromEntries(Object.keys(queueRef.current).map((pid) => [pid, "queued" as Status])) }));
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [sendOne, updateQueue]);

  // Ao abrir, recupera o que ficou guardado (o app pode ter sido fechado) e tenta enviar.
  // Depois, tenta de novo quando a internet volta e a cada 20 segundos enquanto houver algo guardado.
  useEffect(() => {
    let alive = true;
    void readQueue(AsyncStorage, inventoryId).then((stored) => {
      if (!alive || Object.keys(stored).length === 0) return;
      queueRef.current = { ...stored, ...queueRef.current };
      setQueue(queueRef.current);
      setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(stored).map(([pid, it]) => [pid, it.value])) }));
      setStockouts((v) => ({ ...v, ...Object.fromEntries(Object.entries(stored).map(([pid, it]) => [pid, it.stockout ?? ""])) }));
      setStatus((s) => ({ ...s, ...Object.fromEntries(Object.keys(stored).map((pid) => [pid, "queued" as Status])) }));
      void flush();
    });
    const off = onReconnect(() => {
      onlineRef.current = true;
      void flush();
    });
    const timer = setInterval(() => {
      if (Object.keys(queueRef.current).length > 0) void flush();
    }, 20_000);
    const pendingTimers = timers.current;
    return () => {
      alive = false;
      off();
      clearInterval(timer);
      for (const t of Object.values(pendingTimers)) clearTimeout(t);
      // Saiu da tela no meio da espera: tenta enviar o que ficou guardado.
      void flush();
    };
  }, [inventoryId, flush]);

  /**
   * Cada número vai para o aparelho na hora (se o app fechar, nada se perde) e é enviado depois de um
   * instante, para juntar toques seguidos no + e no − e a digitação.
   */
  const commit = useCallback(
    (pid: string, value: string, stockout = stockoutsRef.current[pid] ?? "") => {
      const day = isZero(value) ? stockout : "";
      if (!isZero(value) && stockoutsRef.current[pid]) setStockouts((s) => ({ ...s, [pid]: "" }));
      setMessage((m) => ({ ...m, [pid]: "" }));
      setStatus((s) => ({ ...s, [pid]: "saving" }));
      void updateQueue((q) => {
        // O número mais novo vai para o fim da fila.
        const next = { ...q };
        delete next[pid];
        return { ...next, [pid]: { value, stockout: day || null } };
      });
      clearTimeout(timers.current.send);
      timers.current.send = setTimeout(() => void flush(), 600);
    },
    [flush, updateQueue],
  );

  const onChange = useCallback(
    (pid: string, text: string) => {
      setValues((v) => ({ ...v, [pid]: text }));
      commit(pid, text);
    },
    [commit],
  );
  const onStockout = useCallback(
    (pid: string, day: string, value: string) => {
      setStockouts((s) => ({ ...s, [pid]: day }));
      commit(pid, value, day);
    },
    [commit],
  );

  async function markMissingAsZero() {
    setBusy("zero");
    setCloseError("");
    const res = await fillMissingWithZero(profile, inventoryId);
    setBusy(null);
    if (res.error || !res.ids) {
      setCloseError(res.error ?? "Não foi possível marcar como zero.");
      return;
    }
    const zeros = Object.fromEntries(res.ids.map((pid) => [pid, "0"]));
    setSaved((s) => ({ ...s, ...zeros }));
    setValues((v) => ({ ...v, ...zeros }));
  }

  async function close() {
    setBusy("close");
    setCloseError("");
    const error = await closeInventory(profile, inventoryId);
    setBusy(null);
    if (error) {
      setCloseError(error);
      return;
    }
    await writeQueue(AsyncStorage, inventoryId, {}).catch(() => undefined);
    setClosing(false);
    router.back();
    // Espera a janela de fechar sumir: no iPhone, um aviso aberto no meio do fechamento não aparece.
    setTimeout(
      () =>
        Dialog.alert(
          "Contagem fechada",
          staff ? "Obrigado! O gerente vê a lista de compras." : "A lista de compras desta contagem já está pronta, na aba Compras.",
        ),
      450,
    );
  }

  function discard() {
    Dialog.alert("Descartar a contagem?", "Tudo o que foi digitado nesta contagem será apagado. Isso não pode ser desfeito.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: async () => {
          const error = await discardInventory(profile, inventoryId);
          if (error) {
            Dialog.alert("Não descartou", error);
            return;
          }
          await writeQueue(AsyncStorage, inventoryId, {}).catch(() => undefined);
          router.back();
        },
      },
    ]);
  }

  function showMissing() {
    setClosing(false);
    setSearch("");
    setCategory(null);
    setOnlyMissing(true);
    setTimeout(() => list.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true }), 50);
  }

  const range = stockoutRange(data.previousOn, countedOn);
  const days = useMemo(() => (range ? daysFrom(range.min, range.max).reverse() : []), [range?.min, range?.max]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      {(pendingCount > 0 || !online || fromCache) && (
        <Notice tone="warn" title={pendingCount > 0 ? `Sem internet: ${pendingCount} ${pendingCount === 1 ? "contagem guardada" : "contagens guardadas"} neste aparelho` : "Sem internet"}>
          Pode continuar contando. O app envia sozinho quando a conexão voltar. Não desinstale o app nem saia do login antes disso.
        </Notice>
      )}
      <View style={[ui.card, { gap: 8 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T weight="bold">
            {countedTotal} de {data.products.length} produtos contados
          </T>
          <T weight="extrabold">{percent}%</T>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Progresso da contagem"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={{ height: 12, borderRadius: 6, backgroundColor: colors.line, overflow: "hidden" }}
        >
          <View style={{ height: "100%", width: `${percent}%`, backgroundColor: colors.brand, borderRadius: 6 }} />
        </View>
      </View>
      <Notice title="O que chegou neste dia">
        {data.arrivedBefore.length === 0 && data.arrivedAfter.length === 0 ? (
          <T size={15}>Conte o que está na prateleira. O que chegar depois entra no estoque e não soma neste número.</T>
        ) : (
          <>
            {data.arrivedBefore.length > 0 && (
              <T size={15}>
                {data.arrivedBefore.join(", ")} já {data.arrivedBefore.length === 1 ? "entrou" : "entraram"} antes da contagem. Conte a prateleira inteira, com essa mercadoria.
              </T>
            )}
            {data.arrivedAfter.length > 0 && (
              <T size={15}>
                {data.arrivedAfter.join(", ")} {data.arrivedAfter.length === 1 ? "chegou" : "chegaram"} depois da contagem. Não some essa quantidade de novo.
              </T>
            )}
          </>
        )}
      </Notice>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar produto"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Buscar produto"
        clearButtonMode="while-editing"
        style={ui.input}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Todas" active={!category} onPress={() => setCategory(null)} />
        {categories.map((c) => (
          <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: onlyMissing }}
        onPress={() => setOnlyMissing((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: onlyMissing ? colors.brand : colors.muted,
            backgroundColor: onlyMissing ? colors.brand : colors.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {onlyMissing && <T weight="extrabold" size={14}>✓</T>}
        </View>
        <T weight="semibold">Mostrar só o que falta contar</T>
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `Contagem de ${formatDay(countedOn)}` }} />
      <SectionList
        ref={list}
        sections={sections}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <T weight="bold" size={13} color={colors.muted} style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>
            {section.title}
          </T>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={[ui.card, { alignItems: "center", paddingVertical: 32, borderStyle: "dashed" }]}>
            <T color={colors.muted}>{onlyMissing && missing === 0 ? "Todos os produtos já foram contados." : "Nenhum produto encontrado."}</T>
          </View>
        }
        renderItem={({ item: p }) => (
          <Row
            product={p}
            value={values[p.id] ?? ""}
            status={status[p.id]}
            message={message[p.id]}
            previous={data.previous[p.id]}
            maxPossible={data.maxPossible[p.id]}
            stockout={stockouts[p.id] ?? ""}
            lastEntrada={data.lastEntrada[p.id]}
            days={days}
            onChange={onChange}
            onStockout={onStockout}
          />
        )}
        ListFooterComponent={
          <Pressable accessibilityRole="button" onPress={discard} style={{ alignSelf: "center", minHeight: 48, justifyContent: "center", marginTop: 24 }}>
            <T weight="semibold" color={colors.danger} style={{ textDecorationLine: "underline" }}>
              Descartar esta contagem
            </T>
          </Pressable>
        }
      />
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 8 }}>
          <T size={14} weight="semibold" color={colors.muted}>
            {missing > 0
              ? `Faltam ${missing} ${missing === 1 ? "produto" : "produtos"}. Em branco não é zero: se acabou, digite 0.`
              : "Todos os produtos foram contados."}
          </T>
          <Button
            label="Fechar inventário"
            onPress={() => {
              setCloseError("");
              setClosing(true);
            }}
          />
        </View>
      </SafeAreaView>

      <Modal visible={closing} transparent animationType="fade" onRequestClose={() => setClosing(false)}>
        <Pressable onPress={() => setClosing(false)} style={{ flex: 1, backgroundColor: "rgba(20,20,20,0.5)", justifyContent: "center", padding: 20 }}>
          <Pressable onPress={() => undefined} style={[ui.card, { padding: 22, gap: 12 }]}>
            {pendingCount > 0 ? (
              <>
                <T weight="extrabold" size={21}>Ainda falta enviar</T>
                <T color={colors.muted}>
                  {pendingCount === 1 ? "1 contagem está guardada" : `${pendingCount} contagens estão guardadas`} só neste aparelho. Conecte à
                  internet e espere o envio terminar para fechar.
                </T>
                <Button label="Tentar enviar agora" onPress={() => void flush()} />
                <Button label="Voltar" variant="secondary" onPress={() => setClosing(false)} />
              </>
            ) : missing > 0 ? (
              <>
                <T weight="extrabold" size={21}>{missing === 1 ? "1 produto ficou em branco" : `${missing} produtos ficaram em branco`}</T>
                <T color={colors.muted}>
                  Em branco não é zero: o produto fica fora do consumo e da compra desta semana. Se ele acabou, a contagem é zero.
                </T>
                {closeError !== "" && <T weight="semibold" size={15} color={colors.danger}>{closeError}</T>}
                <Button label="Ver os que faltam" variant="secondary" onPress={showMissing} />
                <Button
                  label={busy === "zero" ? "Marcando…" : `Acabaram: marcar ${missing === 1 ? "como zero" : `os ${missing} como zero`}`}
                  variant="secondary"
                  busy={busy === "zero"}
                  onPress={() => void markMissingAsZero()}
                />
                <Button label="Fechar assim mesmo" busy={busy === "close"} onPress={() => void close()} />
              </>
            ) : (
              <>
                <T weight="extrabold" size={21}>Fechar o inventário?</T>
                <T color={colors.muted}>
                  Todos os produtos foram contados.{" "}
                  {staff ? "Depois de fechar, o gerente vê a lista de compras." : "Depois de fechar, a lista de compras fica no site."}
                </T>
                {closeError !== "" && <T weight="semibold" size={15} color={colors.danger}>{closeError}</T>}
                <Button label="Fechar inventário" busy={busy === "close"} onPress={() => void close()} />
                <Button label="Cancelar" variant="secondary" onPress={() => setClosing(false)} />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 20,
        justifyContent: "center",
        backgroundColor: active ? colors.ink : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.ink : colors.line,
      }}
    >
      <T weight="semibold" size={15} color={active ? "#fff" : colors.ink}>
        {label}
      </T>
    </Pressable>
  );
}

const Row = memo(function Row({
  product: p,
  value,
  status,
  message,
  previous,
  maxPossible,
  stockout,
  lastEntrada,
  days,
  onChange,
  onStockout,
}: {
  product: CountProduct;
  value: string;
  status?: Status;
  message?: string;
  previous?: number;
  maxPossible?: number;
  stockout: string;
  lastEntrada?: string;
  days: string[];
  onChange: (pid: string, text: string) => void;
  onStockout: (pid: string, day: string, value: string) => void;
}) {
  const warnings = countWarnings(value, p.count_unit, maxPossible);
  const zero = isZero(value);
  const cameBack = Boolean(stockout && lastEntrada && stockout < lastEntrada);
  const invalid = status === "error" || warnings.some((w) => w.kind === "invalid");
  return (
    <View style={[ui.card, { paddingVertical: 12, gap: 10 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="semibold">{p.name}</T>
          <T size={14} color={colors.muted}>
            em {p.count_unit}
            {previous !== undefined ? ` · anterior: ${formatQty(previous)}` : ""}
          </T>
          <T size={14} weight="semibold" accessibilityLiveRegion="polite" style={{ minHeight: 19 }}>
            {status === "saving" && <T size={14} color={colors.muted}>Salvando…</T>}
            {status === "queued" && <T size={14} weight="semibold" color={colors.brandText}>Guardado no aparelho · envia quando a internet voltar</T>}
            {status === "saved" && <T size={14} weight="semibold" color={colors.ok}>✓ Salvo</T>}
            {status === "error" && <T size={14} weight="semibold" color={colors.danger}>{message || "Não salvou. Toque no campo e tente de novo."}</T>}
          </T>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <StepButton label="−" a11y={`Diminuir ${p.name}`} onPress={() => onChange(p.id, step(value, -1))} />
        <TextInput
          value={value}
          onChangeText={(t) => onChange(p.id, t)}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={colors.muted}
          accessibilityLabel={`Quantidade de ${p.name} em ${p.count_unit}`}
          selectTextOnFocus
          style={[
            ui.input,
            { flex: 1, textAlign: "center", fontFamily: font.bold, fontSize: 20 },
            invalid ? { borderColor: colors.danger } : null,
          ]}
        />
        <StepButton label="+" a11y={`Aumentar ${p.name}`} onPress={() => onChange(p.id, step(value, 1))} />
      </View>
      {warnings.map((w) => (
        <View key={w.kind} accessibilityRole="alert" style={{ backgroundColor: w.kind === "invalid" ? colors.dangerSoft : colors.brandSoft, borderRadius: 12, padding: 10 }}>
          <T size={14} weight="semibold">{w.text}</T>
        </View>
      ))}
      {zero && days.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 6 }}>
          <T size={15} weight="semibold">Acabou em</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {days.map((d) => {
              const active = stockout === d;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Acabou em ${formatDate(d)}`}
                  onPress={() => onStockout(p.id, active ? "" : d, value)}
                  style={{
                    minWidth: 56,
                    minHeight: 52,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 8,
                    backgroundColor: active ? colors.ink : colors.card,
                    borderWidth: 1,
                    borderColor: active ? colors.ink : colors.line,
                  }}
                >
                  <T size={12} color={active ? "#fff" : colors.muted}>{weekday(d)}</T>
                  <T weight="bold" size={15} color={active ? "#fff" : colors.ink}>{formatDay(d)}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <T size={14} color={colors.muted}>
            O dia em que acabou e não voltou até esta contagem. Sem a data, a compra usa a semana inteira.
          </T>
          {cameBack && lastEntrada && (
            <T size={14} weight="semibold" color={colors.danger}>
              Teve entrada em {formatDate(lastEntrada)} depois desse dia. Informe o dia em que acabou de vez.
            </T>
          )}
        </View>
      )}
    </View>
  );
});

function StepButton({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 56,
        height: 52,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.brandSoft : colors.bg,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <T weight="bold" size={26}>{label}</T>
    </Pressable>
  );
}
