import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, saveSettings } from '../src/shared/storage';

describe('Privacy Shield settings', () => {
  it('preserves independent module toggles during normalization', () => {
    const normalized = normalizeSettings({
      modules: {
        ...DEFAULT_SETTINGS.modules,
        canvas: false,
        ads: false,
        urlCleaner: false,
        browserPrivacy: false,
      },
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.modules.canvas).toBe(false);
    expect(normalized.modules.ads).toBe(false);
    expect(normalized.modules.urlCleaner).toBe(false);
    expect(normalized.modules.browserPrivacy).toBe(false);
    expect(normalized.modules.webrtc).toBe(true);
    expect(normalized.modules.trackers).toBe(true);
    expect(normalized.modules.network).toBe(true);
  });

  it('forces anonymous-only Tor networking even when direct mode is requested', () => {
    const normalized = normalizeSettings({
      enabled: false,
      networkPrivacy: { mode: 'direct_hardened', torPort: 9050 } as any,
    } as any);

    expect(normalized.enabled).toBe(true);
    expect(normalized.networkPrivacy.mode).toBe('local_tor');
    expect(normalized.networkPrivacy.torPort).toBe(9050);
  });

  it('rejects invalid timezones', () => {
    expect(normalizeSettings({ timezone: 'Not/A/Timezone' }).timezone).toBe('auto');
    expect(normalizeSettings({ timezone: 'Europe/Istanbul' }).timezone).toBe('Europe/Istanbul');
  });

  it('normalizes and clamps custom geolocation settings', () => {
    const normalized = normalizeSettings({
      geolocationMode: 'custom',
      spoofedLocation: {
        latitude: 120,
        longitude: -240,
        accuracy: 0,
      },
    });

    expect(normalized.geolocationMode).toBe('custom');
    expect(normalized.spoofedLocation.latitude).toBe(90);
    expect(normalized.spoofedLocation.longitude).toBe(-180);
    expect(normalized.spoofedLocation.accuracy).toBe(1);
  });
  it('forces critical leak protections in Local Tor mode', () => {
    const normalized = normalizeSettings({
      enabled: true,
      modules: {
        ...DEFAULT_SETTINGS.modules,
        webrtc: false,
        network: false,
        permissions: false,
        geolocation: false,
        browserPrivacy: false,
      },
      networkPrivacy: { mode: 'local_tor', torPort: 9150 },
      geolocationMode: 'custom',
    });

    expect(normalized.networkPrivacy.mode).toBe('local_tor');
    expect(normalized.networkPrivacy.torPort).toBe(9150);
    expect(normalized.modules.webrtc).toBe(true);
    expect(normalized.modules.network).toBe(true);
    expect(normalized.modules.permissions).toBe(true);
    expect(normalized.modules.geolocation).toBe(true);
    expect(normalized.modules.browserPrivacy).toBe(true);
    expect(normalized.geolocationMode).toBe('deny');
  });

  it('preserves unrelated module values during partial storage saves', async () => {
    let stored = normalizeSettings({ modules: { ...DEFAULT_SETTINGS.modules, canvas: false, ads: true } });
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ settings: stored })),
          set: vi.fn(async ({ settings }) => { stored = settings; }),
        },
      },
    });

    const updated = await saveSettings({ modules: { webgl: false } });

    expect(updated.modules.canvas).toBe(false);
    expect(updated.modules.webgl).toBe(false);
    expect(updated.modules.ads).toBe(true);
    vi.unstubAllGlobals();
  });

});
