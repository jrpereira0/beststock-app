import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Guide, HowItWorks } from "@/components/guide";
import { GUIDES } from "@/lib/guides";
import { Dialog } from "@/lib/dialog";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Logo, Notice, SectionTitle, T } from "@/components/ui";
import { useAuth, useProfile } from "@/lib/auth";
import { loadHome, markAnnouncementRead, openTodayCount, Offline, type Home } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { useOnline } from "@/lib/network";
import { readQueue } from "@/lib/queue";
import { Bell } from "@/components/bell";
import { cached } from "@/lib/data";
import { useNotifications } from "@/lib/notifications";
import { computePlan } from "@/lib/data-compras";
import { brl } from "@/lib/site/billing";
import type { StockPlan } from "@/lib/site/planning";
import { colors } from "@/lib/theme";
import { ListLink, Stat } from "@/components/widgets";

const ACCESS = { gerente: "Gerente", funcionario: "Funcionário" } as const;

export default function HomeScreen() {
  const profile = useProfile();
  const { refreshProfile, stores, switchStore } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const online = useOnline();
  const [home, setHome] = useState<Home | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState(0);
  const [plan, setPlan] = useState<StockPlan | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await loadHome(profile);
      setHome(res.data);
      setFromCache(res.fromCache);
      setPending(res.data.draft ? Object.keys(await readQueue(AsyncStorage, res.data.draft.id)).length : 0);
      // O gerente vê o resumo do estoque com valores; o funcionário não (nem é calculado no aparelho dele).
      if (profile.access === "gerente" && res.data.lastClosedOn) {
        cached(`beststock:resumo:${profile.store.id}`, () => computePlan(profile.store.id, profile.store.count_interval_days))
          .then((p) => setPlan(p.data))
          .catch(() => setPlan(null));
      }
      // Com internet, confere de novo o perfil: loja bloqueada ou login removido saem na hora.
      if (!res.fromCache) void refreshProfile();
      void refreshNotifications();
    } catch (e) {
      setError(e instanceof Offline ? "Sem internet e nada guardado neste aparelho ainda. Conecte o celular." : "Não foi possível carregar.");
    }
  }, [profile, refreshProfile, refreshNotifications]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openCount() {
    if (home?.draft) {
      router.push(`/contagem/${home.draft.id}`);
      return;
    }
    setOpening(true);
    const res = await openTodayCount(profile);
    setOpening(false);
    if ("error" in res) {
      Dialog.alert("Não abriu a contagem", res.error);
      return;
    }
    router.push(`/contagem/${res.id}`);
  }

  /** Cliente com várias lojas: escolhe a loja pelo nome. Com contagem guardada no aparelho, espera enviar antes. */
  function chooseStore() {
    if (pending > 0) {
      Dialog.alert("Antes de trocar de loja", "Há uma contagem guardada neste aparelho, esperando internet. Conecte o celular e deixe enviar antes de trocar de loja.");
      return;
    }
    Dialog.alert("Trocar de loja", `Você está em ${profile.store.name}. Para qual loja quer ir?`, [
      ...stores
        .filter((s) => s.id !== profile.store.id)
        .map((s) => ({
          text: s.name,
          onPress: async () => {
            const err = await switchStore(s.id);
            if (err) {
              Dialog.alert("Não trocou de loja", err);
              return;
            }
            setHome(null);
            setPlan(null);
            router.navigate("/");
          },
        })),
      { text: "Cancelar", style: "cancel" as const },
    ]);
  }

  async function markRead(id: string) {
    try {
      await markAnnouncementRead(profile.id, id);
      void refreshNotifications();
      setHome((h) => (h ? { ...h, alerts: h.alerts.filter((a) => a.announcementId !== id) } : h));
    } catch {
      Dialog.alert("Sem internet", "Conecte o celular para marcar como lido.");
    }
  }

  const name = profile.name.trim();
  let hero: { kicker: string; title: string; text: string; cta: string };
  if (home?.draft) {
    hero = {
      kicker: "Em andamento",
      title: `Contagem de ${formatDate(home.draft.counted_on)}`,
      text: "Você começou uma contagem e ainda não fechou. Continue de onde parou.",
      cta: "Continuar contagem",
    };
  } else if (home && !home.lastClosedOn) {
    hero = {
      kicker: "Comece por aqui",
      title: "Faça a primeira contagem",
      text: `Conte o que há no estoque hoje. A loja tem ${home.productCount} produtos cadastrados para contar.`,
      cta: "Abrir a contagem de hoje",
    };
  } else if (home?.dueNow) {
    hero = {
      kicker: home.overdue ? "Atenção" : "Hoje",
      title: home.overdue ? "Contagem atrasada" : "Dia de contagem",
      text: home.dueText ?? "",
      cta: "Fazer contagem agora",
    };
  } else {
    hero = {
      kicker: "Tudo em dia",
      title: "Contagem em dia",
      text: `${home?.dueText ?? ""} Quando chegar mercadoria ou algo se perder, registre aqui.`,
      cta: "Abrir a contagem de hoje",
    };
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Logo size={24} />
          {/* Sair fica na aba Mais, como no site. */}
          <Bell />
        </View>

        <View>
          <T color={colors.muted}>
            {name && name !== profile.store.name ? `Olá, ${name}` : "Olá,"} · {ACCESS[profile.access]}
          </T>
          {stores.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Loja ${profile.store.name}. Trocar de loja`}
              onPress={chooseStore}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }}
            >
              <T weight="extrabold" size={26} style={{ flexShrink: 1 }}>{profile.store.name}</T>
              <Ionicons name="swap-horizontal" size={22} color={colors.ink} />
            </Pressable>
          ) : (
            <T weight="extrabold" size={26}>{profile.store.name}</T>
          )}
        </View>

        {(!online || fromCache) && (
          <Notice tone="warn" title="Sem internet">
            Mostrando o que foi guardado neste aparelho. A contagem continua funcionando e envia sozinha quando a conexão voltar.
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}

        {/* Na ordem: como o BestStock funciona, os números, a contagem do dia, o que pede atenção e os atalhos. */}
        {profile.access === "gerente" && home && (!home.lastClosedOn || (plan && plan.inventoryCount < 2)) && <HowItWorks />}

        {plan && profile.access === "gerente" && <Summary plan={plan} />}

        <View style={{ backgroundColor: colors.ink, borderRadius: 24, padding: 20, gap: 6 }}>
          <T weight="bold" size={13} color={colors.brand} style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            {hero.kicker}
          </T>
          <T weight="extrabold" size={24} color="#fff">{hero.title}</T>
          {hero.text.trim() !== "" && <T color="rgba(255,255,255,0.75)">{hero.text.trim()}</T>}
          {pending > 0 && (
            <T weight="semibold" color={colors.brand}>
              {pending === 1 ? "1 contagem guardada" : `${pending} contagens guardadas`} no aparelho, esperando internet.
            </T>
          )}
          <Button label={hero.cta} busy={opening} disabled={!home} onPress={() => void openCount()} style={{ marginTop: 12 }} />
        </View>

        {home && home.alerts.length > 0 && (
          <View style={{ gap: 12 }}>
            <SectionTitle>Precisa da sua atenção</SectionTitle>
            {home.alerts.map((a) => (
              <Notice key={a.id} tone={a.tone === "info" ? "info" : a.tone} title={a.title}>
                {a.text ? <T size={15}>{a.text}</T> : null}
                {a.announcementId && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void markRead(a.announcementId!)}
                    style={{ minHeight: 40, justifyContent: "center", alignSelf: "flex-start" }}
                  >
                    <T weight="bold" size={15} style={{ textDecorationLine: "underline" }}>Marcar como lido</T>
                  </Pressable>
                )}
              </Notice>
            ))}
          </View>
        )}

        <View style={{ gap: 12 }}>
          <SectionTitle>Atalhos</SectionTitle>
          <ListLink icon="add-circle-outline" title="Registrar entrada" subtitle="Chegou mercadoria do fornecedor" onPress={() => router.push("/lancar?tipo=entrada")} />
          <ListLink icon="remove-circle-outline" title="Registrar perda" subtitle="Produto venceu, quebrou ou estragou" onPress={() => router.push("/lancar?tipo=perda")} />
          <ListLink icon="clipboard-outline" title="Inventário" subtitle="Contar o estoque e ver o histórico" onPress={() => router.navigate("/inventario")} />
          {profile.access === "gerente" && (
            <>
              <ListLink icon="bar-chart-outline" title="Consumo" subtitle="O que mais sai e o que está parado" onPress={() => router.push("/consumo")} />
              <ListLink icon="cube-outline" title="Produtos" subtitle="Cadastrar e editar produtos" onPress={() => router.push("/produtos")} />
            </>
          )}
        </View>

        <T size={14} color={colors.muted} style={{ textAlign: "center" }}>
          {profile.access === "gerente"
            ? "Compras, consumo, produtos, fornecedores e financeiro ficam no site."
            : "O resto do sistema fica no site, com o gerente."}
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Resumo do estoque do gerente, como no início do site. */
function Summary({ plan }: { plan: StockPlan }) {
  const toBuy = plan.items.filter((i) => i.suggestedPacks > 0);
  const risk = plan.items.filter((i) => i.status === "falta").length;
  const excess = plan.items.filter((i) => i.status === "excesso").length;
  const buyCost = toBuy.reduce((a, i) => a + i.suggestedPacks * i.product.cost_per_purchase, 0);
  const stockValue = plan.items.reduce((a, i) => a + (i.current ?? 0) * (i.product.cost_per_purchase / i.product.units_per_purchase), 0);
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Resumo do estoque</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Risco de faltar" value={risk} tone={risk > 0 ? "danger" : "neutral"} onPress={() => router.navigate("/compras")} />
        <Stat label="Para comprar" value={toBuy.length} hint={buyCost > 0 ? brl.format(buyCost) : undefined} onPress={() => router.navigate("/compras")} />
        <Stat label="Em excesso" value={excess} onPress={() => router.push("/consumo")} />
        <Stat label="Valor em estoque" value={stockValue > 0 ? brl.format(stockValue) : "—"} onPress={() => router.push("/consumo")} />
      </View>
      <Guide guide={GUIDES.inicio} />
    </View>
  );
}
