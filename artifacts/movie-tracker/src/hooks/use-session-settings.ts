import { useCallback, useSyncExternalStore } from "react";
import {
  getServerSessionSettings,
  getSessionSettings,
  setSentenceLogEnabled,
  subscribeSessionSettings,
} from "@/lib/session-settings";

export function useSessionSettings() {
  const settings = useSyncExternalStore(
    subscribeSessionSettings,
    getSessionSettings,
    getServerSessionSettings,
  );

  const setSentenceLog = useCallback((enabled: boolean) => {
    setSentenceLogEnabled(enabled);
  }, []);

  return {
    settings,
    sentenceLog: settings.sentenceLog,
    setSentenceLog,
  };
}
