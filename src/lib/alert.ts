/** Uma notificação, no mesmo formato do site (lib/notifications.ts). */
export type Alert = {
  id: string;
  tone: "danger" | "warn" | "info";
  title: string;
  text?: string;
  /** Endereço do site onde se resolve (o app traduz para a tela dele). */
  href?: string;
  /** Preenchido quando o alerta é um aviso do administrador (pode ser marcado como lido). */
  announcementId?: string;
};
