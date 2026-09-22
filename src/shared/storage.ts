import { DEFAULT_LANGUAGES, DEFAULT_LOCALE, DEFAULT_SECURITY_MODE } from './constants';
import type { ExtensionModules, ExtensionSettings, ExportedSettings } from './types';
import { uniqueDomains } from './utils';

const STORAGE_KEY = 'settings';
export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  securityMode: DEFAULT_SECURITY_MODE,
  modules: {
    webrtc:true,canvas:true,webgl:true,audio:true,fonts:true,navigator:true,
    screen:true,geolocation:true,timezone:true,headers:true,permissions:true,network:true,
    trackers:true,ads:true,urlCleaner:true,browserPrivacy:true,
  },
  timezone: 'auto',
  geolocationMode: 'deny',
  spoofedLocation: null,
  excludedDomains: [],
  networkPrivacy: { mode: 'direct_hardened' },
};
export function normalizeSettings(input: Partial<ExtensionSettings> | null | undefined): ExtensionSettings {
  const raw = (input ?? {}) as Partial<ExtensionSettings>;
  const modules: ExtensionModules = { ...DEFAULT_SETTINGS.modules, ...(raw.modules ?? {}) };
  const normalized: ExtensionSettings = {
    ...DEFAULT_SETTINGS, ...raw, enabled: raw.enabled !== false, securityMode:'maximum_direct',
    modules, timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : 'auto',
    geolocationMode:'deny', spoofedLocation:null, excludedDomains:uniqueDomains(raw.excludedDomains),
    networkPrivacy:{ mode:'direct_hardened' },
  };
  normalized.modules = { ...DEFAULT_SETTINGS.modules };
  return normalized;
}
export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined);
}
export async function saveSettings(next: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const normalized = normalizeSettings({ ...current, ...next });
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}
export function serializeSettings(settings: ExtensionSettings): string {
  const payload: ExportedSettings = { schemaVersion:1, settings:normalizeSettings(settings), exportedAt:new Date().toISOString() };
  return JSON.stringify(payload,null,2);
}
export function parseImportedSettings(json: string): ExtensionSettings {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid settings document');
  const obj = parsed as Partial<ExportedSettings>;
  if (obj.schemaVersion !== 1 || !obj.settings || typeof obj.settings !== 'object') throw new Error('Unsupported settings schema');
  return normalizeSettings(obj.settings);
}
export const STORAGE_SCHEMA = { key:STORAGE_KEY, locale:DEFAULT_LOCALE, languages:[...DEFAULT_LANGUAGES] } as const;
