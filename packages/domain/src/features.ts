/** Pro features from the "Бесплатно и Pro" table of the spec (section 3). */
export const FEATURES = [
  'program_generation',
  'auto_substitution',
  'smart_progression',
  'deload',
  'report_card',
  'unlimited_charts',
  'export',
  'unlimited_history',
] as const;

export type Feature = (typeof FEATURES)[number];

/** In the MVP there is no payment: every Pro feature is open as a beta. */
const BETA_FEATURES: ReadonlySet<Feature> = new Set(FEATURES);

/**
 * The single place where access to Pro features is decided (spec 6.10).
 * Once payments land, this checks the user's `entitlements` instead.
 */
export function hasFeature(_user: { id: string } | null, feature: Feature): boolean {
  return BETA_FEATURES.has(feature);
}
