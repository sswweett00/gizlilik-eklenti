export type SecurityMode = 'maximum_direct';
export type GeolocationMode = 'deny';
export type NetworkMode = 'direct_hardened';

export interface ExtensionModules {
  webrtc: boolean; canvas: boolean; webgl: boolean; audio: boolean;
  fonts: boolean; navigator: boolean; screen: boolean; geolocation: boolean;
  timezone: boolean; headers: boolean; permissions: boolean; network: boolean;
  trackers: boolean; ads: boolean; urlCleaner: boolean; browserPrivacy: boolean;
}
export interface ExtensionSettings {
  enabled: boolean;
  securityMode: SecurityMode;
  modules: ExtensionModules;
  timezone: 'auto' | string;
  geolocationMode: GeolocationMode;
  spoofedLocation: { latitude: number; longitude: number; accuracy: number };
  excludedDomains: string[];
  networkPrivacy: { mode: NetworkMode };
}
export interface TabPrivacyStats {
  tabId: number;
  matchedRuleCount: number;
  fetchedAt: number;
}
export interface ExportedSettings {
  schemaVersion: 1;
  settings: ExtensionSettings;
  exportedAt: string;
}
