export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  try { if (value.includes('://')) value = new URL(value).hostname.toLowerCase(); } catch { return null; }
  value = value.replace(/^\.+|\.+$/g, '');
  if (!value || value.length > 253 || value.includes('/') || value.includes(':')) return null;
  if (value === 'localhost') return value;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  const labels = value.split('.');
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return null;
  return value;
}
export function uniqueDomains(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeDomain).filter((x): x is string => Boolean(x)))].slice(0, 100);
}
export function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^(?:https?|file):/i.test(url);
}
export function isValidTimeZone(value: unknown): value is string {
  if (value === 'auto') return true;
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
