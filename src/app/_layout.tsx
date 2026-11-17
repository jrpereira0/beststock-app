import { Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, useFonts } from "@expo-google-fonts/outfit";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingScreen } from "@/components/loading-mark";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DialogHost } from "@/lib/dialog";
import { colors } from "@/lib/theme";

/** Na abertura, o símbolo animado aparece pelo menos o tempo de os blocos trocarem de lugar, como no site. */
const OPENING_MS = 2300;

function Gate() {
  const { ready, session, profile, admin } = useAuth();
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setOpened(true), OPENING_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!ready || !opened) return <LoadingScreen dark />;
  // Loja e administrador da rede têm telas diferentes, como no site.
  const store = Boolean(session && profile);
  const network = Boolean(session && admin);
  const signedIn = store || network;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={store}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={network}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold });
  if (!loaded) return <LoadingScreen dark />;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
        <DialogHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
