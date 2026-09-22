import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/storage';

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
});
