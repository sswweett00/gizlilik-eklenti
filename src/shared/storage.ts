import { DEFAULT_LANGUAGES, DEFAULT_LOCALE, DEFAULT_SECURITY_MODE } from './constants';
import type { ExtensionModules, ExtensionSettings, ExtensionSettingsPatch, ExportedSettings } from './types';
import { isValidTimeZone, uniqueDomains } from './utils';

const STORAGE_KEY = 'settings';
const LOCAL_TOR_FORCED_MODULES: ReadonlyArray<keyof ExtensionModules> = [
  'webrtc',
  'network',
  'permissions',
  'geolocation',
  'browserPrivacy',
];
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
  spoofedLocation: { latitude:40.7128, longitude:-74.0060, accuracy:15 },
  excludedDomains: [],
  networkPrivacy: { mode: 'local_tor', torPort: 9050 },
};
export function normalizeSettings(input: Partial<ExtensionSettings> | null | undefined): ExtensionSettings {
  const raw = (input ?? {}) as Partial<ExtensionSettings>;
  const modules: ExtensionModules = { ...DEFAULT_SETTINGS.modules, ...(raw.modules ?? {}) };
  const normalized: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    enabled: true,
    securityMode:'maximum_direct',
    modules,
    timezone: isValidTimeZone(raw.timezone) ? raw.timezone : 'auto',
    geolocationMode: raw.geolocationMode === 'spoof' || raw.geolocationMode === 'custom' ? raw.geolocationMode : 'deny',
    spoofedLocation: raw.spoofedLocation && Number.isFinite(raw.spoofedLocation.latitude) && Number.isFinite(raw.spoofedLocation.longitude)
      ? {
          latitude: Math.min(90, Math.max(-90, raw.spoofedLocation.latitude)),
          longitude: Math.min(180, Math.max(-180, raw.spoofedLocation.longitude)),
          accuracy: Number.isFinite(raw.spoofedLocation.accuracy)
            ? Math.min(10000, Math.max(1, raw.spoofedLocation.accuracy))
            : DEFAULT_SETTINGS.spoofedLocation.accuracy,
        }
      : { ...DEFAULT_SETTINGS.spoofedLocation },
    excludedDomains:uniqueDomains(raw.excludedDomains),
    networkPrivacy:{ mode: 'local_tor', torPort: raw.networkPrivacy?.torPort === 9150 ? 9150 : 9050 },
  };
  normalized.enabled = true;
  normalized.networkPrivacy.mode = 'local_tor';
  if (normalized.enabled && normalized.networkPrivacy.mode === 'local_tor') {
    for (const module of LOCAL_TOR_FORCED_MODULES) normalized.modules[module] = true;
    normalized.geolocationMode = 'deny';
  }

  return normalized;
}
export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined);
}
export async function saveSettings(next: ExtensionSettingsPatch): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const normalized = normalizeSettings({
    ...current,
    ...next,
    modules: { ...current.modules, ...(next.modules ?? {}) },
    spoofedLocation: { ...current.spoofedLocation, ...(next.spoofedLocation ?? {}) },
    networkPrivacy: { ...current.networkPrivacy, ...(next.networkPrivacy ?? {}) },
  });
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
