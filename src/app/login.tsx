import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Field, Logo, Notice, T } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export default function LoginScreen() {
  const { signIn, notice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, gap: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: 8 }}>
            <Logo size={34} color="#fff" />
            <T color="rgba(255,255,255,0.7)" style={{ textAlign: "center" }}>
              Contagem, entradas e perdas da loja
            </T>
          </View>
          <Card style={{ gap: 16, padding: 20 }}>
            <View style={{ gap: 4 }}>
              <T weight="extrabold" size={24}>Entrar</T>
              <T color={colors.muted}>Use o e-mail e a senha da sua loja, os mesmos do site.</T>
            </View>
            {notice && <Notice tone="warn">{notice}</Notice>}
            {!hasSupabaseEnv && <Notice tone="danger">O app está sem a configuração do Supabase (arquivo .env.local).</Notice>}
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
            />
            <View style={{ gap: 6 }}>
              <Field
                label="Senha"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
              />
              <Pressable onPress={() => setShow((s) => !s)} accessibilityRole="button" style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}>
                <T weight="semibold" size={15} style={{ textDecorationLine: "underline" }}>
                  {show ? "Esconder a senha" : "Mostrar a senha"}
                </T>
              </Pressable>
            </View>
            {error && <Notice tone="danger">{error}</Notice>}
            <Button label={busy ? "Entrando…" : "Entrar"} busy={busy} onPress={() => void submit()} />
            <T size={14} color={colors.muted}>Esqueceu a senha? Peça uma nova ao administrador.</T>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
