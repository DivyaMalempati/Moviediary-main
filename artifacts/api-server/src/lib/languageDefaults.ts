/**
 * Cold-start language allowlist when a user has no Preferences yet.
 * India-first (+ optional English) — not a world-cinema grab-bag.
 */
export const INDIA_COLD_START_LANGUAGES = [
  "hi",
  "te",
  "ta",
  "ml",
  "kn",
  "bn",
  "mr",
  "en",
] as const;

/** Broader set only when the user has opted into non-Indian languages. */
export const WORLD_CINEMA_LANGUAGES = [
  ...INDIA_COLD_START_LANGUAGES,
  "ko",
  "ja",
  "fr",
  "de",
  "it",
  "es",
  "zh",
  "fa",
  "tr",
] as const;
