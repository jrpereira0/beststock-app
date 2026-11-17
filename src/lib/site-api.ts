// Ações que dependem da chave secreta ficam no servidor do site (rotas api/app/...).
// O app manda o login de quem está usando; o site confere tudo de novo.
import { supabase } from "./supabase";

export const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
export const hasSite = siteUrl !== "";

export type SiteResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string; status: number };

const OFFLINE = "Sem internet. Conecte o celular e tente de novo.";

export async function callSite<T = Record<string, unknown>>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; auth?: boolean } = {},
): Promise<SiteResult<T>> {
  if (!hasSite) return { ok: false, error: "O endereço do site não está configurado no app (EXPO_PUBLIC_SITE_URL).", status: 0 };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  try {
    const res = await fetch(`${siteUrl}${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok || json.error) return { ok: false, error: json.error ?? "O site não respondeu. Tente de novo.", status: res.status };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: OFFLINE, status: 0 };
  }
}
