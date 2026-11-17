import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Button, T } from "@/components/ui";
import { colors } from "@/lib/theme";

// Aviso e confirmação com a cara do BestStock, no lugar do aviso do sistema do celular.
// Mesmo jeito de usar do Alert.alert do React Native: Dialog.alert(título, mensagem, botões).

export type DialogButton = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void | Promise<void> };
type Item = { id: number; title: string; message?: string; buttons: DialogButton[] };

let queue: Item[] = [];
let nextId = 1;
const listeners = new Set<(items: Item[]) => void>();
const emit = () => listeners.forEach((l) => l(queue));

function dismiss(id: number) {
  queue = queue.filter((i) => i.id !== id);
  emit();
}

export const Dialog = {
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    queue = [...queue, { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: "Entendi" }] }];
    emit();
  },
};

/** Mostra os avisos, um de cada vez. Fica uma vez só, na raiz do app. */
export function DialogHost() {
  const [items, setItems] = useState<Item[]>(queue);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  const current = items[0];

  const press = async (item: Item, b: DialogButton) => {
    dismiss(item.id);
    await b.onPress?.();
  };
  // Tocar fora ou no "voltar" do Android: vale o botão de cancelar, ou o único botão do aviso.
  const back = () => {
    if (!current) return;
    if (cancel) void press(current, cancel);
    else if (single) void press(current, current.buttons[0]);
  };

  // A ação vem primeiro e o "voltar" por último, como nos avisos do site no celular.
  const ordered = current ? [...current.buttons.filter((b) => b.style !== "cancel"), ...current.buttons.filter((b) => b.style === "cancel")] : [];
  const cancel = current?.buttons.find((b) => b.style === "cancel");
  const single = current?.buttons.length === 1;

  return (
    <Modal visible={Boolean(current)} transparent animationType="fade" statusBarTranslucent onRequestClose={back}>
      {current && (
        <Pressable
          accessibilityLabel="Fechar"
          onPress={back}
          style={{ flex: 1, backgroundColor: "rgba(20,20,20,0.55)", justifyContent: "center", padding: 24 }}
        >
          <Pressable
            accessibilityRole="alert"
            onPress={() => undefined}
            style={{ backgroundColor: colors.card, borderRadius: 24, padding: 22, gap: 10, maxWidth: 440, width: "100%", alignSelf: "center" }}
          >
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginBottom: 4 }} />
            <T weight="extrabold" size={21}>{current.title}</T>
            {current.message ? <T color={colors.muted}>{current.message}</T> : null}
            <View style={{ gap: 8, marginTop: 10 }}>
              {ordered.map((b) => (
                <Button
                  key={b.text}
                  label={b.text}
                  variant={b.style === "cancel" ? "secondary" : b.style === "destructive" ? "dangerSolid" : "primary"}
                  onPress={() => void press(current, b)}
                />
              ))}
            </View>
          </Pressable>
        </Pressable>
      )}
    </Modal>
  );
}
