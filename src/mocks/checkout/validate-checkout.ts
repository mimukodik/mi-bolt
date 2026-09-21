/**
 * T08 — checkout validation primitives.
 *
 * Pure helpers used by the checkout domain and its MSW handlers to
 * normalize and validate the wire bodies declared in `openapi.yaml`.
 * Every function returns either a normalized string or `null` so the
 * caller can collect every error path before reporting them back as
 * a 422 `VALIDATION_ERROR`. Normalization here is deliberately
 * idempotent: the same input string always yields the same output.
 *
 * The normalizers are exposed individually so tests can probe the
 * substring/trim rules directly and so other slices can reuse them
 * (e.g. T09 may validate an `OrderRequest` contact echo).
 */

/** Collapses internal whitespace runs, trims edges, and NFC-normalizes. */
export function normalizeWhitespace(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.normalize('NFC');
}

/** Normalize a contact full name: trim + collapse + NFC, length 2..100. */
export function normalizeContactFullName(value: unknown): string | null {
  const normalized = normalizeWhitespace(value);
  if (normalized === null) return null;
  if (normalized.length < 2 || normalized.length > 100) return null;
  return normalized;
}

/** Normalize an email: trim + lowercase, must match a basic RFC 5322 shape. */
export function normalizeContactEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase().normalize('NFC');
  if (candidate.length === 0 || candidate.length > 254) return null;
  // Pragmatic email check: local@domain with at least one dot in domain.
  // The OpenAPI constraint is `format: email`, which delegates to the
  // runtime. The mock must reject obviously-bad shapes to keep the
  // contract meaningful, while still accepting every well-formed input.
  // Three single-quantifier patterns instead of one nested-quantifier regex
  // (flagged by security/detect-unsafe-regex): local part, then each domain
  // label; the accepted set is unchanged.
  const localPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
  const labelMultiPattern = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
  const labelSinglePattern = /^[a-z0-9]$/;
  const atIndex = candidate.indexOf('@');
  if (atIndex < 1) return null;
  if (!localPattern.test(candidate.slice(0, atIndex))) return null;
  const domain = candidate.slice(atIndex + 1);
  const labels = domain.split('.');
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (
      label.length > 0 &&
      label.length <= 63 &&
      (labelSinglePattern.test(label) || labelMultiPattern.test(label))
    ) {
      continue;
    }
    return null;
  }
  return candidate;
}

/** Normalize a phone number to the +36 prefix and 8 or 9 trailing digits. */
export function normalizeContactPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, '');
  if (!/^\+36[0-9]{8,9}$/.test(trimmed)) return null;
  return trimmed;
}

/** Normalize an HU country code: the schema only allows HU. */
export function normalizeAddressCountryCode(value: unknown): 'HU' | null {
  return value === 'HU' ? 'HU' : null;
}

/** Normalize an HU postal code: 4 digits, first in 1..9 (rejects 0123). */
export function normalizeAddressPostalCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!/^[1-9][0-9]{3}$/.test(value)) return null;
  return value;
}

/** Normalize an HU city: trim + collapse + NFC, length 2..80. */
export function normalizeAddressCity(value: unknown): string | null {
  const normalized = normalizeWhitespace(value);
  if (normalized === null) return null;
  if (normalized.length < 2 || normalized.length > 80) return null;
  return normalized;
}

/** Normalize address line1: trim + NFC, length 3..120. */
export function normalizeAddressLine1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().normalize('NFC');
  if (trimmed.length < 3 || trimmed.length > 120) return null;
  return trimmed;
}

/** Normalize optional address line2: trim + NFC, length 1..120, undefined allowed. */
export function normalizeAddressLine2(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().normalize('NFC');
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > 120) return null;
  return trimmed;
}
