import { useSyncExternalStore } from "react";
import {
  getSessionSettings,
  setSentenceLogEnabled,
  subscribeSessionSettings,
  type SessionSettings,
} from "@/lib/session-settings";

function getSnapshot(): SessionSettings {
  return getSessionSettings();
}

function getServerSnapshot(): SessionSettings {
  return { sentenceLog: false };
}

export function useSessionSettings() {
  const settings = useSyncExternalStore(
    subscribeSessionSettings,
    getSnapshot,
    getServerSnapshot,
  );

  return {
    settings,
    sentenceLog: settings.sentenceLog,
    setSentenceLog: setSentenceLogEnabled,
  };
}
