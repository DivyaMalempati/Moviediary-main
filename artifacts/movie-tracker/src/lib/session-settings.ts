/**
 * Browser session settings — toggles for trying unreleased UX without redeploy.
 * Stored in localStorage so it survives refresh; not synced to the server.
 *
 * Snapshots are referentially stable when values don't change — required by
 * useSyncExternalStore (a new object every read causes Maximum update depth).
 */

const SENTENCE_LOG_KEY = "cinevault:session:sentence-log";

export type SessionSettings = {
  /** Fill-in-the-blank diary log on Add (default off). */
  sentenceLog: boolean;
};

const DEFAULTS: SessionSettings = {
  sentenceLog: false,
};

/** Stable server/SSR snapshot. */
const SERVER_SNAPSHOT: SessionSettings = { sentenceLog: false };

let cachedSnapshot: SessionSettings = { ...DEFAULTS };
let cachedKey = "";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function snapshotKey(sentenceLog: boolean) {
  return sentenceLog ? "1" : "0";
}

export function getSessionSettings(): SessionSettings {
  const sentenceLog = readBool(SENTENCE_LOG_KEY, DEFAULTS.sentenceLog);
  const key = snapshotKey(sentenceLog);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSnapshot = { sentenceLog };
  }
  return cachedSnapshot;
}

export function getServerSessionSettings(): SessionSettings {
  return SERVER_SNAPSHOT;
}

export function isSentenceLogEnabled(): boolean {
  return getSessionSettings().sentenceLog;
}

export function setSentenceLogEnabled(enabled: boolean) {
  writeBool(SENTENCE_LOG_KEY, enabled);
  // Bust cache so the next getSnapshot returns a new reference.
  cachedKey = "";
  try {
    window.dispatchEvent(
      new CustomEvent("cinevault:session-settings", {
        detail: { sentenceLog: enabled },
      }),
    );
  } catch {
    /* ignore */
  }
}

/** React-friendly subscription for session setting changes. */
export function subscribeSessionSettings(listener: () => void) {
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === SENTENCE_LOG_KEY || e.key === null) listener();
  };
  window.addEventListener("cinevault:session-settings", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("cinevault:session-settings", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
