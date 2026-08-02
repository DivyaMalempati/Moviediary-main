/** Indian cinema languages (no English). Used to prioritize India-first trope hits. */
export const INDIAN_CINEMA_LANGUAGES = [
  "hi",
  "te",
  "ta",
  "ml",
  "kn",
  "bn",
  "mr",
] as const;

/**
 * Cold-start language allowlist when a user has no Preferences yet.
 * India-first (+ optional English) — not a world-cinema grab-bag.
 */
export const INDIA_COLD_START_LANGUAGES = [
  ...INDIAN_CINEMA_LANGUAGES,
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
