import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

// Só a chave pública: quem protege os dados é a regra por linha do banco, a mesma do site.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const hasSupabaseEnv = Boolean(url && key);

export const supabase = createClient(url || "https://sem-configuracao.invalid", key || "sem-chave", {
  auth: {
    // O login fica guardado no aparelho: o app abre logado mesmo sem internet.
    ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renova o login só com o app aberto na tela (recomendação do Supabase para React Native).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
