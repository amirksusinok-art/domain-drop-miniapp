export type TelegramApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (style: "success" | "error") => void;
  };
  BackButton?: {
    isVisible?: boolean;
    show: () => void;
    hide: () => void;
    onClick: (f: () => void) => void;
    offClick: (f: () => void) => void;
  };
};
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramApp };
  }
}
export function setupTelegram() {
  const tg = window.Telegram?.WebApp;
  tg?.ready();
  tg?.expand();
  tg?.setHeaderColor?.("#090c13");
  tg?.setBackgroundColor?.("#090c13");
}
export function haptic(style: "light" | "medium" | "heavy" = "light") {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* Older Telegram clients do not support haptics. */
  }
}
