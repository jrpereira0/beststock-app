import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchMyStores, switchStoreRpc, type MyStore } from "./my-stores";
import { isNetworkError } from "./queue.ts";
import { callSite, hasSite } from "./site-api";
import { supabase } from "./supabase";

export type Store = { id: string; name: string; active: boolean; count_interval_days: number };
export type Profile = {
  id: string;
  role: "admin" | "store";
  store_id: string | null;
  name: string;
  email: string;
  /** Gerente vê valores e compras; funcionário conta e lança entradas e perdas. */
  access: "gerente" | "funcionario";
  store: Store;
};

/** Administrador da rede: não tem loja; usa o painel da rede no app. */
export type AdminProfile = { id: string; role: "admin"; name: string; email: string };

/** As mesmas mensagens do site (src/app/login/page.tsx). */
export const LOGIN_MESSAGES = {
  perfil: "Este usuário ainda não tem acesso liberado. Fale com o administrador.",
  inativa: "Esta unidade está bloqueada. Fale com o administrador.",
  admin: "O aplicativo é para as lojas. Entre no site para usar o painel da rede.",
} as const;

const profileKey = "beststock:perfil";

type ProfileResult = { profile: Profile } | { admin: AdminProfile } | { blocked: keyof typeof LOGIN_MESSAGES } | { offline: true };

/** Lê o perfil e a loja do banco, com as mesmas barreiras do site (src/lib/auth.ts). */
async function fetchProfile(userId: string, retry = true): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, store_id, name, email, access, stores!store_id(id, name, active, count_interval_days)")
    .eq("id", userId)
    .maybeSingle();
  if (error) return isNetworkError(error) ? { offline: true } : { blocked: "perfil" };
  if (!data) return { blocked: "perfil" };
  const { stores, ...rest } = data as unknown as Omit<Profile, "store"> & { stores: Store | Store[] | null };
  if (rest.role === "admin") return { admin: { id: rest.id, role: "admin", name: rest.name, email: rest.email } };
  const store = (Array.isArray(stores) ? stores[0] : stores) ?? null;
  // Loja desativada: a regra do banco não devolve a linha. Quem tem outra loja ativa passa para ela.
  if (!store || !store.active || !rest.store_id) {
    if (retry) {
      const { data: next } = await supabase.rpc("ensure_active_store");
      if (next) return fetchProfile(userId, false);
    }
    return { blocked: "inativa" };
  }
  return { profile: { ...rest, store } };
}

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Preenchido quando quem entrou é o administrador da rede. */
  admin: AdminProfile | null;
  /** Mensagem para a tela de login (loja bloqueada, sem perfil). */
  notice: string | null;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
  /** Lojas do login. Com mais de uma, a pessoa troca de loja pelo nome na tela inicial. */
  stores: MyStore[];
  /** Troca a loja que o login usa. Devolve a mensagem de erro, ou null quando deu certo. */
  switchStore(id: string): Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stores, setStores] = useState<MyStore[]>([]);
  const userRef = useRef<string | null>(null);

  const block = useCallback(async (reason: keyof typeof LOGIN_MESSAGES) => {
    setNotice(LOGIN_MESSAGES[reason]);
    setProfile(null);
    setAdmin(null);
    await AsyncStorage.removeItem(profileKey);
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  /** Confere o perfil no banco. Sem internet, usa o último perfil guardado deste login. */
  const loadProfile = useCallback(
    async (userId: string) => {
      const res = await fetchProfile(userId).catch((): ProfileResult => ({ offline: true }));
      if ("profile" in res) {
        // Só troca o objeto se algo mudou: as telas recarregam quando o perfil muda.
        setProfile((old) => (old && JSON.stringify(old) === JSON.stringify(res.profile) ? old : res.profile));
        setAdmin(null);
        await AsyncStorage.setItem(profileKey, JSON.stringify(res.profile));
        // As lojas do login: sem internet, vale a última lista guardada.
        const storesKey = `beststock:lojas:${userId}`;
        try {
          const list = await fetchMyStores();
          setStores((old) => (JSON.stringify(old) === JSON.stringify(list) ? old : list));
          await AsyncStorage.setItem(storesKey, JSON.stringify(list));
        } catch {
          const raw = await AsyncStorage.getItem(storesKey);
          if (raw) setStores(JSON.parse(raw) as MyStore[]);
        }
      } else if ("admin" in res) {
        setAdmin((old) => (old && JSON.stringify(old) === JSON.stringify(res.admin) ? old : res.admin));
        setProfile(null);
        await AsyncStorage.setItem(profileKey, JSON.stringify(res.admin));
      } else if ("blocked" in res) {
        await block(res.blocked);
      } else {
        const raw = await AsyncStorage.getItem(profileKey);
        const cached = raw ? (JSON.parse(raw) as Profile | AdminProfile) : null;
        if (cached?.id === userId && cached.role === "admin") setAdmin((old) => (old && JSON.stringify(old) === raw ? old : (cached as AdminProfile)));
        else if (cached?.id === userId) setProfile((old) => (old && JSON.stringify(old) === raw ? old : (cached as Profile)));
        else {
          setProfile(null);
          setAdmin(null);
        }
      }
    },
    [block],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      userRef.current = data.session?.user.id ?? null;
      if (data.session) await loadProfile(data.session.user.id);
      if (alive) setReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const id = next?.user.id ?? null;
      if (id !== userRef.current) {
        userRef.current = id;
        if (!id) {
          setProfile(null);
          setAdmin(null);
        }
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (rawEmail: string, password: string): Promise<string | null> => {
      const email = rawEmail.trim().toLowerCase().slice(0, 254);
      if (!email || !password) return "Informe e-mail e senha.";
      setNotice(null);
      // Pelo site: vale a trava de 8 senhas erradas, como no login do site. Se o site ainda não tem a
      // rota (404) ou não está configurado, entra direto pelo Supabase.
      if (hasSite) {
        const res = await callSite<{ access_token: string; refresh_token: string }>("/api/app/login", { body: { email, password }, auth: false });
        if (res.ok) {
          const { data, error } = await supabase.auth.setSession(res.data);
          if (error || !data.session) return "Não foi possível entrar. Tente de novo.";
          userRef.current = data.session.user.id;
          setSession(data.session);
          await loadProfile(data.session.user.id);
          return null;
        }
        if (res.status !== 404 && res.status !== 0) return res.error;
      }
      const { data, error } = await supabase.auth
        .signInWithPassword({ email, password })
        .catch((e: Error) => ({ data: { session: null }, error: { name: "AuthRetryableFetchError", message: e.message, status: 0 } }));
      if (error || !data.session) {
        // Sem resposta do servidor: o Supabase devolve status 0 (AuthRetryableFetchError).
        if (error && (error.name === "AuthRetryableFetchError" || !error.status)) {
          return "Sem internet. Conecte o celular para entrar.";
        }
        if (error?.status === 429) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
        // A mesma mensagem para e-mail que não existe e senha errada: não revela quais e-mails têm login.
        return "E-mail ou senha incorretos.";
      }
      userRef.current = data.session.user.id;
      setSession(data.session);
      await loadProfile(data.session.user.id);
      return null;
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    setProfile(null);
    setAdmin(null);
    setStores([]);
    await AsyncStorage.removeItem(profileKey);
    await supabase.auth.signOut({ scope: "local" });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (userRef.current) await loadProfile(userRef.current);
  }, [loadProfile]);

  const switchStore = useCallback(
    async (id: string) => {
      const err = await switchStoreRpc(id);
      if (err) return err;
      if (userRef.current) await loadProfile(userRef.current);
      return null;
    },
    [loadProfile],
  );

  const value = useMemo(
    () => ({ ready, session, profile, admin, notice, signIn, signOut, refreshProfile, stores, switchStore }),
    [ready, session, profile, admin, notice, signIn, signOut, refreshProfile, stores, switchStore],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

/** Perfil de quem está logado, dentro das telas do app (o layout já garante que existe). */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error("Sem perfil");
  return profile;
}

/** Administrador logado, dentro das telas do painel da rede (o layout já garante que existe). */
export function useAdmin(): AdminProfile {
  const { admin } = useAuth();
  if (!admin) throw new Error("Sem administrador");
  return admin;
}
