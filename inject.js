/**
 * Privacy Shield v3.1 — inject.js
 *
 * Executes at document_start in MAIN world — before ANY page script runs.
 *
 * Core idea: every tab generates its own randomized profile from realistic
 * pools (cities/locales, user agents, screens, GPUs, hardware). The profile
 * is stable within a tab session (sessionStorage) but unique across tabs.
 *
 * NEW in v2.1:
 *  - bridge.js relays the per-tab profile to the background, which installs
 *    per-tab declarativeNetRequest session rules so HTTP headers (UA,
 *    Accept-Language, Sec-CH-UA*) MATCH the JS-level identity of each tab.
 *  - Deterministic per-position noise for canvas/WebGL/audio/fonts — repeated
 *    reads are consistent and noise can never accumulate.
 *  - Date.prototype.toString family spoofed (getTimezoneOffset alone leaked).
 *  - Popup settings (geolocation mode/coords, timezone, module toggles) are
 *    actually wired into this script via a token-guarded bridge channel.
 *
 * Protection modules:
 *  1.  Native toString shield (anti-proxy-detection)
 *  2.  WebRTC leak prevention
 *  3.  Canvas noise injection (per-tab seeded PRNG)
 *  4.  WebGL parameter masking (per-tab GPU profile)
 *  5.  AudioContext noise injection (per-tab seeded PRNG)
 *  6.  Font enumeration & DOM geometry protection
 *  7.  Navigator property overrides (per-tab profile)
 *  8.  Client Hints neutralization (per-tab profile)
 *  9.  Screen property overrides (per-tab profile)
 * 10.  Geolocation spoofing (deny / per-tab city / custom coords)
 * 11.  Timezone / Intl spoofing (per-tab or fixed timezone)
 */

(function PrivacyShield() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: PRNG UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mulberry32 — fast, high-quality 32-bit PRNG.
   * Returns a function that yields floats in [0, 1).
   */
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: REALISTIC PROFILE POOLS
  // ═══════════════════════════════════════════════════════════════════════════

  const POOL = Object.freeze({

    userAgents: [
      // Chrome on Windows
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        platform: 'Win32', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '124' }, { brand: 'Google Chrome', version: '124' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'Windows', uaPlatformVersion: '15.0.0', uaFullVersion: '124.0.0.0',
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        platform: 'Win32', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '123' }, { brand: 'Google Chrome', version: '123' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'Windows', uaPlatformVersion: '15.0.0', uaFullVersion: '123.0.0.0',
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        platform: 'Win32', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '122' }, { brand: 'Google Chrome', version: '122' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'Windows', uaPlatformVersion: '14.0.0', uaFullVersion: '122.0.0.0',
      },
      // Microsoft Edge on Windows
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
        platform: 'Win32', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '124' }, { brand: 'Microsoft Edge', version: '124' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'Windows', uaPlatformVersion: '15.0.0', uaFullVersion: '124.0.0.0',
      },
      {
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
        platform: 'Win32', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '123' }, { brand: 'Microsoft Edge', version: '123' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'Windows', uaPlatformVersion: '14.0.0', uaFullVersion: '123.0.0.0',
      },
      // Chrome on macOS
      {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        platform: 'MacIntel', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '124' }, { brand: 'Google Chrome', version: '124' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'macOS', uaPlatformVersion: '14.4.0', uaFullVersion: '124.0.0.0',
      },
      {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        platform: 'MacIntel', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '123' }, { brand: 'Google Chrome', version: '123' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'macOS', uaPlatformVersion: '13.6.0', uaFullVersion: '123.0.0.0',
      },
      // Safari on macOS
      {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
        platform: 'MacIntel', vendor: 'Apple Computer, Inc.', productSub: '20030107',
        brands: [{ brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'macOS', uaPlatformVersion: '14.4.1', uaFullVersion: '17.4.1',
      },
      {
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
        platform: 'MacIntel', vendor: 'Apple Computer, Inc.', productSub: '20030107',
        brands: [{ brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'macOS', uaPlatformVersion: '13.6.3', uaFullVersion: '16.6',
      },
      // Chrome on Linux
      {
        ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        platform: 'Linux x86_64', vendor: 'Google Inc.', productSub: '20030107',
        brands: [{ brand: 'Chromium', version: '124' }, { brand: 'Google Chrome', version: '124' }, { brand: 'Not-A.Brand', version: '99' }],
        uaPlatform: 'Linux', uaPlatformVersion: '', uaFullVersion: '124.0.0.0',
      },
    ],

    locales: [
      { timezone: 'America/New_York',    lang: 'en-US', langs: ['en-US', 'en'],              lat: 40.7128,  lng: -74.0060,  city: 'New York'    },
      { timezone: 'America/Los_Angeles', lang: 'en-US', langs: ['en-US', 'en'],              lat: 34.0522,  lng: -118.2437, city: 'Los Angeles'  },
      { timezone: 'America/Chicago',     lang: 'en-US', langs: ['en-US', 'en'],              lat: 41.8781,  lng: -87.6298,  city: 'Chicago'      },
      { timezone: 'America/Denver',      lang: 'en-US', langs: ['en-US', 'en'],              lat: 39.7392,  lng: -104.9903, city: 'Denver'       },
      { timezone: 'America/Vancouver',   lang: 'en-CA', langs: ['en-CA', 'en', 'fr-CA'],    lat: 49.2827,  lng: -123.1207, city: 'Vancouver'    },
      { timezone: 'America/Toronto',     lang: 'en-CA', langs: ['en-CA', 'en'],              lat: 43.6532,  lng: -79.3832,  city: 'Toronto'      },
      { timezone: 'Europe/London',       lang: 'en-GB', langs: ['en-GB', 'en'],              lat: 51.5074,  lng: -0.1278,   city: 'London'       },
      { timezone: 'Europe/Paris',        lang: 'fr-FR', langs: ['fr-FR', 'fr', 'en'],        lat: 48.8566,  lng: 2.3522,    city: 'Paris'        },
      { timezone: 'Europe/Berlin',       lang: 'de-DE', langs: ['de-DE', 'de', 'en'],        lat: 52.5200,  lng: 13.4050,   city: 'Berlin'       },
      { timezone: 'Europe/Amsterdam',    lang: 'nl-NL', langs: ['nl-NL', 'nl', 'en'],        lat: 52.3676,  lng: 4.9041,    city: 'Amsterdam'    },
      { timezone: 'Europe/Stockholm',    lang: 'sv-SE', langs: ['sv-SE', 'sv', 'en'],        lat: 59.3293,  lng: 18.0686,   city: 'Stockholm'    },
      { timezone: 'Europe/Warsaw',       lang: 'pl-PL', langs: ['pl-PL', 'pl', 'en'],        lat: 52.2297,  lng: 21.0122,   city: 'Warsaw'       },
      { timezone: 'Europe/Madrid',       lang: 'es-ES', langs: ['es-ES', 'es', 'en'],        lat: 40.4168,  lng: -3.7038,   city: 'Madrid'       },
      { timezone: 'Europe/Rome',         lang: 'it-IT', langs: ['it-IT', 'it', 'en'],        lat: 41.9028,  lng: 12.4964,   city: 'Rome'         },
      { timezone: 'Asia/Tokyo',          lang: 'ja-JP', langs: ['ja-JP', 'ja', 'en'],        lat: 35.6762,  lng: 139.6503,  city: 'Tokyo'        },
      { timezone: 'Asia/Shanghai',       lang: 'zh-CN', langs: ['zh-CN', 'zh', 'en'],        lat: 31.2304,  lng: 121.4737,  city: 'Shanghai'     },
      { timezone: 'Asia/Singapore',      lang: 'en-SG', langs: ['en-SG', 'en', 'zh'],        lat: 1.3521,   lng: 103.8198,  city: 'Singapore'    },
      { timezone: 'Asia/Dubai',          lang: 'ar-AE', langs: ['ar-AE', 'ar', 'en'],        lat: 25.2048,  lng: 55.2708,   city: 'Dubai'        },
      { timezone: 'Asia/Seoul',          lang: 'ko-KR', langs: ['ko-KR', 'ko', 'en'],        lat: 37.5665,  lng: 126.9780,  city: 'Seoul'        },
      { timezone: 'Australia/Sydney',    lang: 'en-AU', langs: ['en-AU', 'en'],              lat: -33.8688, lng: 151.2093,  city: 'Sydney'       },
    ],

    screens: [
      { w: 1920, h: 1080, dpr: 1    },
      { w: 1920, h: 1080, dpr: 1.25 },
      { w: 1920, h: 1200, dpr: 1    },
      { w: 2560, h: 1440, dpr: 1    },
      { w: 2560, h: 1440, dpr: 2    },
      { w: 1440, h: 900,  dpr: 2    },
      { w: 1366, h: 768,  dpr: 1    },
      { w: 1280, h: 800,  dpr: 2    },
      { w: 1600, h: 900,  dpr: 1    },
      { w: 3840, h: 2160, dpr: 2    },
      { w: 1280, h: 1024, dpr: 1    },
      { w: 2560, h: 1080, dpr: 1    },
    ],

    hardware: [
      { cores: 4,  memory: 4  },
      { cores: 4,  memory: 8  },
      { cores: 6,  memory: 8  },
      { cores: 8,  memory: 8  },
      { cores: 8,  memory: 16 },
      { cores: 12, memory: 16 },
      { cores: 16, memory: 16 },
      { cores: 16, memory: 32 },
    ],

    webgl: [
      { vendor: 'Google Inc. (Intel)',  renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (Intel)',  renderer: 'ANGLE (Intel, Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (Intel)',  renderer: 'ANGLE (Intel, Mesa Intel(R) HD Graphics 620 (KBL GT2), OpenGL 4.6)'        },
      { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (AMD)',    renderer: 'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)'    },
      { vendor: 'Google Inc. (AMD)',    renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'      },
      { vendor: 'Apple Inc.',           renderer: 'Apple GPU'                                                                 },
    ],

  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: PER-TAB PROFILE GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generates or restores a unique profile for this tab session.
   * The profile is persisted in sessionStorage, so it survives navigations
   * within the same tab but is fresh for every new tab.
   */
  function generateTabProfile() {
    const STORAGE_KEY = '__ps_v2_profile';

    // Never restore a profile from sessionStorage: the page owns that storage
    // and could poison it before this document_start script runs.

    // Generate a fresh unpredictable seed for this tab. Web Crypto is
    // synchronous here, so it is safe to use during document_start.
    let seed = 0;
    try {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      seed = random[0] >>> 0;
    } catch (_) {}
    if (!seed) seed = 0xA7F31C29;

    // Build per-module PRNGs from the same seed (XOR with different constants)
    const rng  = mulberry32(seed);
    const rng2 = mulberry32(seed ^ 0xABCD1234);

    function pick(arr) {
      return arr[Math.floor(rng() * arr.length)];
    }

    // Keep network identity coherent with the actual Chromium build.
    // Cross-platform/random UA spoofing creates a detectable mismatch because
    // the first navigation request and Chromium Client Hints are emitted
    // before this page-world script can register a per-tab profile.
    const actualUA = String(navigator.userAgent || '');
    const actualAppVersion = String(navigator.appVersion || actualUA.replace(/^Mozilla\//, ''));
    const actualPlatform = String(navigator.platform || '');
    const actualVendor = String(navigator.vendor || '');
    const actualVendorSub = String(navigator.vendorSub || '');
    const actualProduct = String(navigator.product || 'Gecko');
    const actualProductSub = String(navigator.productSub || '');
    const actualUAData = navigator.userAgentData;
    const uaMajor = (actualUA.match(/(?:Chrome|Chromium|Edg|Firefox)\/(\d+)/) || [null, '0'])[1];
    const actualBrands = actualUAData && Array.isArray(actualUAData.brands)
      ? actualUAData.brands.map((b) => ({ brand: String(b.brand), version: String(b.version) }))
      : [];
    const actualUAPlatform = actualUAData && typeof actualUAData.platform === 'string'
      ? actualUAData.platform
      : (/Win/i.test(actualPlatform) ? 'Windows' : /Mac/i.test(actualPlatform) ? 'macOS' : 'Linux');
    const actualUAPlatformVersion = actualUAData && typeof actualUAData.platformVersion === 'string'
      ? actualUAData.platformVersion
      : '';
    const actualUAFullVersion = actualUAData && typeof actualUAData.fullVersion === 'string'
      ? actualUAData.fullVersion
      : uaMajor + '.0.0.0';
    const actualUAMobile = actualUAData ? actualUAData.mobile === true : /Mobile/i.test(actualUA);

    // Locale is standardized to a common profile in maximum mode so
    // Turkish/system locale settings cannot become a location side channel.
    const locEntry = {
      timezone: 'UTC',
      lang: 'en-US',
      langs: ['en-US', 'en'],
      lat: 0,
      lng: 0,
      city: 'Hidden',
    };
    const currentInnerW = Math.max(320, Number(window.innerWidth) || 1280);
    const currentInnerH = Math.max(240, Number(window.innerHeight) || 720);
    const compatibleScreens = POOL.screens.filter(function (screen) {
      return screen.w >= currentInnerW && screen.h >= currentInnerH;
    });
    const screenEntry = pick(compatibleScreens.length ? compatibleScreens : POOL.screens);

    const actualCores = Math.max(1, Number(navigator.hardwareConcurrency) || 8);
    const actualMemory = Math.max(1, Number(navigator.deviceMemory) || 8);
    const compatibleHardware = POOL.hardware.filter(function (hw) {
      return hw.cores <= actualCores && hw.memory <= actualMemory;
    });
    const hwEntry = pick(compatibleHardware.length ? compatibleHardware : POOL.hardware);

    const compatibleGL = POOL.webgl.filter(function (gpu) {
      if (/^Mac/i.test(actualPlatform)) return gpu.vendor.includes('Apple') || gpu.vendor.includes('Intel');
      if (/Win/i.test(actualPlatform)) return !gpu.vendor.includes('Apple');
      return !gpu.vendor.includes('Apple');
    });
    const glEntry = pick(compatibleGL.length ? compatibleGL : POOL.webgl);

    // Add a tiny geographic jitter so even the same city pick varies (±~3km)
    const latJitter = (rng2() - 0.5) * 0.06;
    const lngJitter = (rng2() - 0.5) * 0.06;

    const profile = {
      seed,
      // Network/browser identity is kept native and coherent.
      ua: actualUA,
      appVersion: actualAppVersion,
      platform: actualPlatform,
      vendor: actualVendor,
      vendorSub: actualVendorSub,
      product: actualProduct,
      productSub: actualProductSub,
      uaBrands: actualBrands,
      uaPlatform: actualUAPlatform,
      uaPlatformVersion: actualUAPlatformVersion,
      uaFullVersion: actualUAFullVersion,
      uaMobile: actualUAMobile,
      // Locale/timezone: language remains internally coherent; timezone is
      // standardized in maximum mode instead of exposing the local timezone.
      language: locEntry.lang,
      languages: Object.freeze([...locEntry.langs]),
      timezone: 'UTC',
      city: 'Hidden',
      // Geolocation is deny-by-default in maximum mode.
      lat: 0,
      lng: 0,
      geoAccuracy: 10000,
      // Screen
      screenW: screenEntry.w,
      screenH: screenEntry.h,
      dpr: screenEntry.dpr,
      colorDepth: 24,
      // Hardware
      cores: hwEntry.cores,
      memory: hwEntry.memory,
      maxTouchPoints: 0,
      // WebGL
      glVendor: glEntry.vendor,
      glRenderer: glEntry.renderer,
    };

    // Keep the profile only in this isolated JavaScript closure. It is never
    // serialized into page-controlled storage.
    return profile;
  }

  // Generate this tab's unique profile (runs synchronously at document_start)
  const TAB = generateTabProfile();

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: GLOBAL MODULE SETTINGS (on/off flags from popup)
  // ═══════════════════════════════════════════════════════════════════════════

  const MODULE_DEFAULTS = {
    enabled: true,
    webrtc: true, canvas: true, webgl: true, audio: true,
    fonts: true, navigator: true, screen: true, geolocation: true,
    timezone: true, permissions: true, network: true,
    trackers: true, ads: true, urlCleaner: true, browserPrivacy: true,
  };

  // Non-flag preferences pushed from the background via bridge.js.
  const PREF_DEFAULTS = {
    securityMode: 'maximum_direct',
    geolocationMode: 'deny',
    timezone: 'auto',        // 'auto' = per-tab timezone
    spoofedLocation: null,   // { latitude, longitude } used by 'custom' mode
    excludedDomains: [],
    networkPrivacy: {
      mode: 'direct_hardened',
    },
  };

  // Security state is supplied by the isolated-world bridge for every document.
  // Defaults remain enabled until the extension settings arrive.
  let _modules = { ...MODULE_DEFAULTS, enabled: true };
  let _prefs = {
    ...PREF_DEFAULTS,
    securityMode: 'maximum_direct',
    geolocationMode: 'deny',
    timezone: 'auto',
    spoofedLocation: null,
    excludedDomains: [],
    networkPrivacy: { mode: 'direct_hardened' },
  };

  function isExcludedHost() {
    const host = String(location.hostname || '').toLowerCase();
    return Array.isArray(_prefs.excludedDomains) && _prefs.excludedDomains.some(function (domain) {
      return host === domain || host.endsWith('.' + domain);
    });
  }

  const on = (mod) => {
    if (!_modules.enabled || _modules[mod] === false) return false;
    return !isExcludedHost();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: NATIVE toString SHIELD (anti-proxy-detection)
  // ═══════════════════════════════════════════════════════════════════════════

  const _nativeToString = Function.prototype.toString;
  const _nativeRegistry = new WeakMap();

  function markNative(fn, name) {
    _nativeRegistry.set(fn, name !== undefined ? name : (fn.name || ''));
    return fn;
  }

  Object.defineProperty(Function.prototype, 'toString', {
    value: function toString() {
      if (_nativeRegistry.has(this)) {
        const n = _nativeRegistry.get(this);
        return `function ${n}() { [native code] }`;
      }
      return _nativeToString.call(this);
    },
    writable: true,
    configurable: true,
  });
  markNative(Function.prototype.toString, 'toString');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: HELPER UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Define a property with optional getter/setter, marking them native. */
  function defProp(obj, prop, descriptor) {
    const d = { configurable: true, enumerable: descriptor.enumerable === true };
    if ('get' in descriptor) {
      d.get = descriptor.get;
      if (d.get) markNative(d.get, `get ${prop}`);
    }
    if ('set' in descriptor) {
      d.set = descriptor.set;
      if (d.set) markNative(d.set, `set ${prop}`);
    }
    if ('value' in descriptor) {
      d.value = descriptor.value;
      d.writable = descriptor.writable !== false;
    }
    Object.defineProperty(obj, prop, d);
  }

  /** Override a prototype method, wrapping the original, and mark as native. */
  function overrideMethod(proto, name, impl) {
    const original = proto[name];
    const wrapper = function (...args) { return impl.call(this, original, args); };
    markNative(wrapper, name);
    Object.defineProperty(proto, name, {
      value: wrapper, writable: true, configurable: true, enumerable: false,
    });
    return wrapper;
  }

  /** Clamp a byte value to [0, 255]. */
  function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  /**
   * Integer avalanche hash → uint32. Used for *deterministic* noise:
   * the same pixel/sample always receives the same offset within a tab,
   * so repeated fingerprint reads are consistent and noise cannot
   * accumulate across calls.
   */
  function hashInt(a) {
    a = a >>> 0;
    a = Math.imul(a ^ (a >>> 16), 0x21f0aaad) >>> 0;
    a = Math.imul(a ^ (a >>> 15), 0x735a2d97) >>> 0;
    return (a ^ (a >>> 15)) >>> 0;
  }

  /** Deterministic unit-variate in [0, 1) from a seed and an index. */
  function noiseUnit(seed, index) {
    return hashInt((seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0) / 4294967296;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 1: WebRTC LEAK PREVENTION
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('webrtc')) {
    const _OrigPC = window.RTCPeerConnection;

    if (_OrigPC) {
      const strictIpLock = true;

      if (strictIpLock) {
        const BlockedPC = function RTCPeerConnection() {
          throw new DOMException('WebRTC disabled by Privacy Shield IP Lock.', 'NotAllowedError');
        };
        BlockedPC.prototype = _OrigPC.prototype;
        markNative(BlockedPC, 'RTCPeerConnection');
        window.RTCPeerConnection = BlockedPC;
        window.webkitRTCPeerConnection = BlockedPC;
        window.mozRTCPeerConnection = BlockedPC;
      } else {
        function sanitizeConfig(cfg) {
          if (!cfg) return { iceServers: [], iceTransportPolicy: 'relay' };
          return { ...cfg, iceServers: [], iceTransportPolicy: 'relay' };
        }

        const SafePC = function RTCPeerConnection(config, constraints) {
          return new _OrigPC(sanitizeConfig(config), constraints);
        };
        SafePC.prototype = _OrigPC.prototype;
        if (_OrigPC.generateCertificate) {
          SafePC.generateCertificate = markNative(
            _OrigPC.generateCertificate.bind(_OrigPC), 'generateCertificate'
          );
        }
        markNative(SafePC, 'RTCPeerConnection');
        window.RTCPeerConnection = SafePC;
        window.webkitRTCPeerConnection = SafePC;
        window.mozRTCPeerConnection = SafePC;
      }
    }

    // WebRTC is fully disabled in direct hardened mode, so no SDP mutation
    // or setLocalDescription overload patch is necessary.
    if (navigator.mediaDevices) {
      try {
        defProp(MediaDevices.prototype, 'getUserMedia', {
          value: markNative(function getUserMedia() {
            return Promise.reject(new DOMException('Media capture disabled by Privacy Shield.', 'NotAllowedError'));
          }, 'getUserMedia'),
          writable: true,
        });
      } catch (_) {}
      try {
        defProp(MediaDevices.prototype, 'getDisplayMedia', {
          value: markNative(function getDisplayMedia() {
            return Promise.reject(new DOMException('Display capture disabled by Privacy Shield.', 'NotAllowedError'));
          }, 'getDisplayMedia'),
          writable: true,
        });
      } catch (_) {}
    }

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        value: markNative(() => Promise.resolve([]), 'enumerateDevices'),
        writable: true, configurable: true,
      });
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 2: NETWORK SURFACE HARDENING
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('network')) {
    // WebGPU exposes adapter capabilities and limits that can become a high-
    // entropy hardware fingerprint. Maximum mode disables the page API.
    try {
      defProp(Navigator.prototype, 'gpu', { get: function () { return undefined; } });
      try {
        defProp(navigator, 'gpu', { get: function () { return undefined; } });
      } catch (_) {}
    } catch (_) {}

    if (window.EventSource) {
      const NativeEventSource = window.EventSource;
      const BlockedEventSource = function EventSource() {
        throw new DOMException('EventSource disabled by Privacy Shield.', 'NotAllowedError');
      };
      BlockedEventSource.prototype = NativeEventSource.prototype;
      markNative(BlockedEventSource, 'EventSource');
      window.EventSource = BlockedEventSource;
    }

    if (window.WebSocket) {
      const NativeWebSocket = window.WebSocket;
      const BlockedWebSocket = function WebSocket() {
        throw new DOMException('WebSocket disabled by Privacy Shield.', 'NotAllowedError');
      };
      BlockedWebSocket.prototype = NativeWebSocket.prototype;
      markNative(BlockedWebSocket, 'WebSocket');
      window.WebSocket = BlockedWebSocket;
    }

    try {
      defProp(Navigator.prototype, 'sendBeacon', {
        value: markNative(function sendBeacon() { return false; }, 'sendBeacon'),
        writable: true,
      });
    } catch (_) {}

    if (window.WebTransport) {
      const NativeWebTransport = window.WebTransport;
      const BlockedWebTransport = function WebTransport() {
        throw new DOMException('WebTransport disabled by Privacy Shield.', 'NotAllowedError');
      };
      BlockedWebTransport.prototype = NativeWebTransport.prototype;
      markNative(BlockedWebTransport, 'WebTransport');
      window.WebTransport = BlockedWebTransport;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
        value: markNative(function enumerateDevices() {
          return Promise.resolve([]);
        }, 'enumerateDevices'),
        configurable: true,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 3: DEVICE / SENSOR / PERSISTENCE SURFACE HARDENING
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('network')) {
    const rejectAccess = (label) =>
      Promise.reject(new DOMException(label + ' disabled by Privacy Shield.', 'NotAllowedError'));

    // Physical-device access can reveal hardware, attached peripherals and
    // stable device capabilities. Maximum mode exposes none of these surfaces.
    const asyncDeviceMethods = [
      [navigator.bluetooth, 'requestDevice', 'Bluetooth'],
      [navigator.bluetooth, 'requestLEScan', 'Bluetooth LE'],
      [navigator.usb, 'requestDevice', 'USB'],
      [navigator.usb, 'getDevices', 'USB enumeration'],
      [navigator.hid, 'requestDevice', 'HID'],
      [navigator.hid, 'getDevices', 'HID enumeration'],
      [navigator.serial, 'requestPort', 'Serial'],
      [navigator.serial, 'getPorts', 'Serial enumeration'],
    ];
    for (const [api, name, label] of asyncDeviceMethods) {
      if (!api || typeof api[name] !== 'function') continue;
      try {
        api[name] = markNative(function () { return rejectAccess(label); }, name);
      } catch (_) {
        try {
          Object.defineProperty(api, name, {
            value: markNative(function () { return rejectAccess(label); }, name),
            configurable: true,
            writable: true,
          });
        } catch (_) {}
      }
    }

    if (typeof navigator.requestMIDIAccess === 'function') {
      try {
        Navigator.prototype.requestMIDIAccess = markNative(
          function requestMIDIAccess() { return rejectAccess('MIDI'); },
          'requestMIDIAccess'
        );
      } catch (_) {}
    }

    if (navigator.keyboard && typeof navigator.keyboard.getLayoutMap === 'function') {
      try {
        defProp(Keyboard.prototype, 'getLayoutMap', {
          value: markNative(function getLayoutMap() { return rejectAccess('Keyboard layout'); }, 'getLayoutMap'),
          writable: true,
        });
      } catch (_) {}
    }

    if (navigator.mediaDevices && typeof navigator.mediaDevices.getSupportedConstraints === 'function') {
      try {
        defProp(MediaDevices.prototype, 'getSupportedConstraints', {
          value: markNative(function getSupportedConstraints() { return {}; }, 'getSupportedConstraints'),
          writable: true,
        });
      } catch (_) {}
    }

    if (navigator.mediaCapabilities) {
      for (const name of ['decodingInfo', 'encodingInfo']) {
        if (typeof navigator.mediaCapabilities[name] !== 'function') continue;
        try {
          defProp(MediaCapabilities.prototype, name, {
            value: markNative(function () { return rejectAccess('Media capabilities'); }, name),
            writable: true,
          });
        } catch (_) {}
      }
    }

    if (navigator.xr) {
      try {
        defProp(Navigator.prototype, 'xr', { get: function () { return undefined; } });
      } catch (_) {}
    }

    if (typeof navigator.getGamepads === 'function') {
      try {
        defProp(Navigator.prototype, 'getGamepads', {
          value: markNative(function getGamepads() { return []; }, 'getGamepads'),
          writable: true,
        });
      } catch (_) {}
    }

    if (navigator.credentials && typeof navigator.credentials.get === 'function') {
      for (const name of ['get', 'create']) {
        try {
          defProp(navigator.credentials, name, {
            value: markNative(function () { return rejectAccess('Credential access'); }, name),
            writable: true,
          });
        } catch (_) {}
      }
    }

    if (navigator.clipboard) {
      for (const name of ['read', 'readText']) {
        if (typeof navigator.clipboard[name] !== 'function') continue;
        try {
          defProp(navigator.clipboard, name, {
            value: markNative(function () { return rejectAccess('Clipboard read'); }, name),
            writable: true,
          });
        } catch (_) {}
      }
    }

    if (typeof navigator.share === 'function') {
      try {
        defProp(Navigator.prototype, 'share', {
          value: markNative(function share() { return rejectAccess('Web Share'); }, 'share'),
          writable: true,
        });
        defProp(Navigator.prototype, 'canShare', {
          value: markNative(function canShare() { return false; }, 'canShare'),
          writable: true,
        });
      } catch (_) {}
    }

    // Sensors and motion events are unnecessary for ordinary page operation
    // but provide high-entropy hardware/environment data.
    for (const ctorName of [
      'Accelerometer', 'Gyroscope', 'LinearAccelerationSensor',
      'AbsoluteOrientationSensor', 'RelativeOrientationSensor',
      'Magnetometer', 'AmbientLightSensor',
    ]) {
      const NativeCtor = window[ctorName];
      if (!NativeCtor) continue;
      try {
        const BlockedCtor = function () {
          throw new DOMException('Sensor API disabled by Privacy Shield.', 'NotAllowedError');
        };
        BlockedCtor.prototype = NativeCtor.prototype;
        markNative(BlockedCtor, ctorName);
        window[ctorName] = BlockedCtor;
      } catch (_) {}
    }

    // Block motion/orientation event listeners without touching unrelated
    // EventTarget listeners.
    try {
      overrideMethod(EventTarget.prototype, 'addEventListener', function (orig, args) {
        const type = String(args[0] || '').toLowerCase();
        if (type === 'deviceorientation' || type === 'deviceorientationabsolute' || type === 'devicemotion') {
          return undefined;
        }
        return orig.apply(this, args);
      });
    } catch (_) {}

    for (const prop of ['ondeviceorientation', 'ondeviceorientationabsolute', 'ondevicemotion']) {
      try {
        defProp(window, prop, { get: function () { return null; }, set: function () {} });
      } catch (_) {}
    }

    // High-entropy Client Hints expose OS/architecture details not needed by
    // ordinary pages. Network headers are separately stripped by DNR.
    if (window.NavigatorUAData && NavigatorUAData.prototype &&
        typeof NavigatorUAData.prototype.getHighEntropyValues === 'function') {
      try {
        defProp(NavigatorUAData.prototype, 'getHighEntropyValues', {
          value: markNative(function getHighEntropyValues() {
            return rejectAccess('High-entropy Client Hints');
          }, 'getHighEntropyValues'),
          writable: true,
        });
      } catch (_) {}
    }

    // Prevent cross-site storage re-grants that can reconnect third-party
    // identity state after third-party cookies are blocked.
    if (document && typeof document.requestStorageAccess === 'function') {
      try {
        defProp(Document.prototype, 'requestStorageAccess', {
          value: markNative(function requestStorageAccess() {
            return rejectAccess('Storage Access API');
          }, 'requestStorageAccess'),
          writable: true,
        });
      } catch (_) {}
    }
    if (document && typeof document.requestStorageAccessFor === 'function') {
      try {
        defProp(Document.prototype, 'requestStorageAccessFor', {
          value: markNative(function requestStorageAccessFor() {
            return rejectAccess('Storage Access API');
          }, 'requestStorageAccessFor'),
          writable: true,
        });
      } catch (_) {}
    }
    if (document && typeof document.hasStorageAccess === 'function') {
      try {
        defProp(Document.prototype, 'hasStorageAccess', {
          value: markNative(function hasStorageAccess() { return Promise.resolve(false); }, 'hasStorageAccess'),
          writable: true,
        });
      } catch (_) {}
    }

    // Prevent persistent service-worker/push state from becoming a durable
    // cross-session identifier.
    if (navigator.serviceWorker && typeof ServiceWorkerContainer !== 'undefined' && ServiceWorkerContainer.prototype) {
      try {
        defProp(ServiceWorkerContainer.prototype, 'register', {
          value: markNative(function register() { return rejectAccess('Service Workers'); }, 'register'),
          writable: true,
        });
        defProp(ServiceWorkerContainer.prototype, 'getRegistration', {
          value: markNative(function getRegistration() { return Promise.resolve(undefined); }, 'getRegistration'),
          writable: true,
        });
        defProp(ServiceWorkerContainer.prototype, 'getRegistrations', {
          value: markNative(function getRegistrations() { return Promise.resolve([]); }, 'getRegistrations'),
          writable: true,
        });
      } catch (_) {}
    }
    if (window.PushManager && PushManager.prototype && typeof PushManager.prototype.subscribe === 'function') {
      try {
        defProp(PushManager.prototype, 'subscribe', {
          value: markNative(function subscribe() { return rejectAccess('Push subscription'); }, 'subscribe'),
          writable: true,
        });
        defProp(PushManager.prototype, 'getSubscription', {
          value: markNative(function getSubscription() { return Promise.resolve(null); }, 'getSubscription'),
          writable: true,
        });
      } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 4: CANVAS NOISE (per-tab seeded PRNG)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('canvas')) {
    const CANVAS_SEED = (TAB.seed ^ 0xC4A7A5) >>> 0;

    // Capture the raw (unpatched) accessors first so we can read/write the
    // true bitmap without triggering our own noise.
    const rawGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const rawPutImageData = CanvasRenderingContext2D.prototype.putImageData;

    /**
     * ±1 RGB noise keyed by ABSOLUTE canvas pixel coordinates: the same pixel
     * always receives the same offset, so repeated reads are consistent and
     * noise can never accumulate across calls.
     */
    function noisifyRegion(data, rectX, rectY, rectW, canvasW) {
      const px = data.length >> 2;
      const rw = rectW > 0 ? rectW : 1;
      for (let p = 0; p < px; p++) {
        const x = rectX + (p % rw);
        const y = rectY + ((p / rw) | 0);
        const h = hashInt((CANVAS_SEED ^ Math.imul(y * canvasW + x + 1, 0x9e3779b9)) >>> 0);
        const i = p << 2;
        data[i]     = clampByte(data[i]     + ((h & 1) ? 1 : -1));
        data[i + 1] = clampByte(data[i + 1] + (((h >>> 2) & 1) ? 1 : -1));
        data[i + 2] = clampByte(data[i + 2] + (((h >>> 4) & 1) ? 1 : -1));
        // Alpha channel left intact to avoid visual artefacts
      }
    }

    /**
     * Run `fn` (a serialization call like toDataURL) with the noised bitmap
     * temporarily in place, then restore the original pixels — the page's
     * canvas is never permanently altered.
     */
    function buildNoisedCanvas(source) {
      let ctx = null;
      try { ctx = source.getContext('2d'); } catch (_) {}
      const w = source.width;
      const h = source.height;
      if (!ctx || !w || !h) return null;
      try {
        const current = rawGetImageData.call(ctx, 0, 0, w, h);
        const noised = new ImageData(new Uint8ClampedArray(current.data), w, h);
        noisifyRegion(noised.data, 0, 0, w, w);
        const temp = document.createElement('canvas');
        temp.width = w;
        temp.height = h;
        const tempCtx = temp.getContext('2d');
        tempCtx.putImageData(noised, 0, 0);
        return temp;
      } catch (_) {
        return null;
      }
    }

    overrideMethod(HTMLCanvasElement.prototype, 'toDataURL', function (orig, args) {
      const temp = buildNoisedCanvas(this);
      return temp ? orig.apply(temp, args) : orig.apply(this, args);
    });

    overrideMethod(HTMLCanvasElement.prototype, 'toBlob', function (orig, args) {
      const temp = buildNoisedCanvas(this);
      return temp ? orig.apply(temp, args) : orig.apply(this, args);
    });

    overrideMethod(CanvasRenderingContext2D.prototype, 'getImageData', function (orig, args) {
      const img = orig.apply(this, args);
      try {
        const cw = (this.canvas && this.canvas.width) || img.width;
        noisifyRegion(img.data, args[0] | 0, args[1] | 0, args[2] | 0, cw);
      } catch (_) {}
      return img;
    });

    // OffscreenCanvas has a separate 2D context surface and can otherwise
    // bypass the HTMLCanvasElement serialization hooks above.
    if (window.OffscreenCanvas) {
      const offscreenContext = window.OffscreenCanvasRenderingContext2D;
      if (offscreenContext && offscreenContext.prototype) {
        try {
          overrideMethod(offscreenContext.prototype, 'getImageData', function (orig, args) {
            const img = orig.apply(this, args);
            try {
              const cw = (this.canvas && this.canvas.width) || img.width;
              noisifyRegion(img.data, args[0] | 0, args[1] | 0, args[2] | 0, cw);
            } catch (_) {}
            return img;
          });
        } catch (_) {}
      }

      overrideMethod(window.OffscreenCanvas.prototype, 'convertToBlob', function (orig, args) {
        try {
          const width = this.width;
          const height = this.height;
          const ctx = this.getContext('2d');
          if (!ctx || !width || !height) return orig.apply(this, args);

          const current = ctx.getImageData(0, 0, width, height);
          const noised = new ImageData(new Uint8ClampedArray(current.data), width, height);
          noisifyRegion(noised.data, 0, 0, width, width);

          const temp = new window.OffscreenCanvas(width, height);
          const tempCtx = temp.getContext('2d');
          tempCtx.putImageData(noised, 0, 0);
          return orig.apply(temp, args);
        } catch (_) {
          return orig.apply(this, args);
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 5: WebGL PARAMETER MASKING (per-tab GPU profile)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('webgl')) {
    const glVendor   = TAB.glVendor;
    const glRenderer = TAB.glRenderer;
    const GL_SEED    = (TAB.seed ^ 0x619F2A) >>> 0;

    function patchGetParameter(proto) {
      overrideMethod(proto, 'getParameter', function (orig, [pname]) {
        if (pname === 0x9245) return glVendor;   // UNMASKED_VENDOR_WEBGL
        if (pname === 0x9246) return glRenderer; // UNMASKED_RENDERER_WEBGL
        return orig.call(this, pname);
      });
    }

    function patchReadPixels(proto) {
      overrideMethod(proto, 'readPixels', function (orig, args) {
        orig.apply(this, args);
        const pixels = args[6];
        if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
          for (let i = 0; i < pixels.length; i += 4) {
            const jitter = noiseUnit(GL_SEED, i >> 2) < 0.5 ? 1 : -1;
            pixels[i] = clampByte(pixels[i] + jitter);
          }
        }
      });
    }

    function patchDebugRendererSurface(proto) {
      overrideMethod(proto, 'getSupportedExtensions', function (orig, args) {
        const extensions = orig.apply(this, args);
        return Array.isArray(extensions)
          ? extensions.filter((name) => name !== 'WEBGL_debug_renderer_info')
          : extensions;
      });
      overrideMethod(proto, 'getExtension', function (orig, [name]) {
        return name === 'WEBGL_debug_renderer_info' ? null : orig.call(this, name);
      });
    }

    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (C) {
        patchGetParameter(C.prototype);
        patchReadPixels(C.prototype);
        patchDebugRendererSurface(C.prototype);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 6: AUDIOCONTEXT NOISE (per-tab seeded PRNG)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('audio')) {
    const AUDIO_SEED = (TAB.seed ^ 0xA0D10C) >>> 0;

    if (window.AnalyserNode) {
      overrideMethod(AnalyserNode.prototype, 'getFloatFrequencyData', function (orig, [arr]) {
        orig.call(this, arr);
        if (arr) for (let i = 0; i < arr.length; i++) arr[i] += (noiseUnit(AUDIO_SEED, i) - 0.5) * 0.1;
      });
      overrideMethod(AnalyserNode.prototype, 'getByteFrequencyData', function (orig, [arr]) {
        orig.call(this, arr);
        if (arr) for (let i = 0; i < arr.length; i++) arr[i] = clampByte(arr[i] + (noiseUnit(AUDIO_SEED, i) < 0.5 ? 1 : -1));
      });
      overrideMethod(AnalyserNode.prototype, 'getFloatTimeDomainData', function (orig, [arr]) {
        orig.call(this, arr);
        if (arr) for (let i = 0; i < arr.length; i++) arr[i] += (noiseUnit(AUDIO_SEED, i) - 0.5) * 2e-7;
      });
      overrideMethod(AnalyserNode.prototype, 'getByteTimeDomainData', function (orig, [arr]) {
        orig.call(this, arr);
        if (arr) for (let i = 0; i < arr.length; i++) arr[i] = clampByte(arr[i] + (noiseUnit(AUDIO_SEED, i) < 0.5 ? 1 : -1));
      });
    }

    if (window.OfflineAudioContext) {
      overrideMethod(OfflineAudioContext.prototype, 'startRendering', function (orig, args) {
        return orig.apply(this, args).then(function (buffer) {
          try {
            const nativeGet = buffer.getChannelData.bind(buffer);
            Object.defineProperty(buffer, 'getChannelData', {
              value: markNative(function getChannelData(channel) {
                const raw = nativeGet(channel);
                const copy = new Float32Array(raw);
                for (let i = 0; i < copy.length; i++) copy[i] += (noiseUnit(AUDIO_SEED, i) - 0.5) * 2e-7;
                return copy;
              }, 'getChannelData'),
              configurable: true, writable: true,
            });
          } catch (_) {}
          return buffer;
        });
      });
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 7: FONT ENUMERATION & DOM GEOMETRY PROTECTION
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('fonts')) {
    const FONT_SEED = (TAB.seed ^ 0xF0A4B9) >>> 0;

    // Deterministic jitter: the same element/text must always shift the same
    // way, otherwise page scripts can detect the patch by re-measuring.
    const _rectJitter = new WeakMap();
    let _rectSerial = 0;
    function rectJitters(el) {
      let j = _rectJitter.get(el);
      if (!j) {
        const h = hashInt((FONT_SEED ^ Math.imul(++_rectSerial, 0x9e3779b9)) >>> 0);
        j = [
          ((h & 0xff) / 255 - 0.5) * 0.1,
          (((h >>> 8) & 0xff) / 255 - 0.5) * 0.1,
          (((h >>> 16) & 0xff) / 255 - 0.5) * 0.1,
          (((h >>> 24) & 0xff) / 255 - 0.5) * 0.1,
        ];
        _rectJitter.set(el, j);
      }
      return j;
    }
    function jitteredRect(orig, args, target) {
      const r = orig.apply(target, args);
      const j = rectJitters(target);
      return new DOMRect(r.x + j[0], r.y + j[1], r.width + j[2], r.height + j[3]);
    }

    if (window.CanvasRenderingContext2D) {
      overrideMethod(CanvasRenderingContext2D.prototype, 'measureText', function (orig, args) {
        const m = orig.apply(this, args);
        const text = typeof args[0] === 'string' ? args[0] : '';
        let h = FONT_SEED >>> 0;
        for (let i = 0; i < text.length; i++) {
          h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
        }
        const jit = ((h >>> 8) / 16777216 - 0.5) * 0.1;
        return new Proxy(m, {
          get(t, p) {
            const v = t[p];
            return typeof v === 'number' ? v + jit : v;
          },
        });
      });
    }

    overrideMethod(Element.prototype, 'getBoundingClientRect', function (orig, args) {
      return jitteredRect(orig, args, this);
    });

    if (window.Range) {
      overrideMethod(Range.prototype, 'getBoundingClientRect', function (orig, args) {
        return jitteredRect(orig, args, this);
      });
    }

    // Keep FontFaceSet.check native; broad false negatives break legitimate pages.
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 8: NAVIGATOR OVERRIDES (per-tab profile)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('navigator')) {
    const overrides = {
      userAgent:           TAB.ua,
      appVersion:          TAB.appVersion,
      platform:            TAB.platform,
      vendor:              TAB.vendor,
      vendorSub:           TAB.vendorSub,
      product:             TAB.product,
      productSub:          TAB.productSub,
      language:            TAB.language,
      languages:           TAB.languages,
      hardwareConcurrency: TAB.cores,
      deviceMemory:        TAB.memory,
      maxTouchPoints:      TAB.maxTouchPoints,
      pdfViewerEnabled:    true,
      cookieEnabled:       true,
      onLine:              true,
      doNotTrack:          null,
    };

    for (const [prop, value] of Object.entries(overrides)) {
      if (value === undefined) continue;
      try {
        defProp(Navigator.prototype, prop, {
          get: function () { return value; },
        });
      } catch (_) {
        try {
          Object.defineProperty(navigator, prop, {
            get: markNative(function () { return value; }, `get ${prop}`),
            configurable: true,
          });
        } catch (_) {}
      }
    }

    // Standardize common OS preference media queries that otherwise expose
    // local theme/accessibility choices. Layout and resolution queries remain native.
    const _nativeMatchMedia = typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : null;
    if (_nativeMatchMedia) {
      const MEDIA_QUERY_OVERRIDES = [
        [/\(prefers-color-scheme\s*:\s*dark\)/i, false],
        [/\(prefers-color-scheme\s*:\s*light\)/i, true],
        [/\(prefers-reduced-motion\s*:\s*reduce\)/i, false],
        [/\(prefers-contrast\s*:\s*(more|less)\)/i, false],
        [/\(forced-colors\s*:\s*active\)/i, false],
        [/\(inverted-colors\s*:\s*inverted\)/i, false],
      ];

      function normalizedMatchMedia(query) {
        const mql = _nativeMatchMedia(query);
        const raw = String(query || '');
        let forced = null;
        for (const [pattern, value] of MEDIA_QUERY_OVERRIDES) {
          if (pattern.test(raw)) {
            forced = value;
            break;
          }
        }
        if (forced === null) return mql;

        return new Proxy(mql, {
          get(target, prop, receiver) {
            if (prop === 'matches') return forced;
            if (prop === 'onchange') return null;
            if (prop === 'addEventListener' || prop === 'addListener') {
              return function () { return undefined; };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
      }

      try {
        defProp(window, 'matchMedia', {
          value: markNative(normalizedMatchMedia, 'matchMedia'),
          writable: true,
          configurable: true,
        });
      } catch (_) {}
    }

    // Delete network info fingerprinting APIs
    for (const prop of ['connection', 'mozConnection', 'webkitConnection']) {
      try {
        defProp(Navigator.prototype, prop, { get: function () { return undefined; } });
      } catch (_) {}
    }

    // Battery API spoofing
    try {
      Navigator.prototype.getBattery = markNative(function getBattery() {
        return Promise.resolve({
          charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0,
          addEventListener:    markNative(function () {}, 'addEventListener'),
          removeEventListener: markNative(function () {}, 'removeEventListener'),
          dispatchEvent:       markNative(function () { return true; }, 'dispatchEvent'),
        });
      }, 'getBattery');
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 9: PERMISSIONS API COHERENCE
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('permissions') && navigator.permissions && navigator.permissions.query) {
    const _permissionQuery = navigator.permissions.query.bind(navigator.permissions);
    function makePermissionStatus(state) {
      try {
        const status = new EventTarget();
        if (window.PermissionStatus && PermissionStatus.prototype) Object.setPrototypeOf(status, PermissionStatus.prototype);
        let onchange = null;
        Object.defineProperty(status, 'state', { get: function () { return state; }, configurable: true });
        Object.defineProperty(status, 'onchange', {
          get: function () { return onchange; },
          set: function (fn) { onchange = typeof fn === 'function' ? fn : null; },
          configurable: true
        });
        return status;
      } catch (_) { return { state: state }; }
    }
    Object.defineProperty(navigator.permissions, 'query', {
      value: markNative(function query(descriptor) {
        if (descriptor && ['geolocation', 'camera', 'microphone', 'notifications', 'push', 'midi'].includes(descriptor.name) && on('permissions')) {
          return Promise.resolve(makePermissionStatus('denied'));
        }
        return _permissionQuery(descriptor);
      }, 'query'),
      writable: true, configurable: true,
    });
  }
  if (on('permissions') && typeof window.Notification === 'function') {
    try {
      defProp(Notification, 'permission', { get: function () { return 'denied'; } });
      defProp(Notification, 'requestPermission', {
        value: markNative(function requestPermission() { return Promise.resolve('denied'); }, 'requestPermission'),
        writable: true,
      });
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 10: CLIENT HINTS COHERENCE
  // ═══════════════════════════════════════════════════════════════════════════

  // Never replace low-entropy Client Hints with a cross-platform fake profile.
  // The request headers and JS values must describe the same Chromium build.
  // High-entropy hints are removed by declarativeNetRequest rules.
  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 11: SCREEN OVERRIDES (per-tab profile)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('screen')) {
    const screenProps = {
      width:       TAB.screenW,
      height:      TAB.screenH,
      availWidth:  TAB.screenW,
      availHeight: TAB.screenH - 40,
      availLeft:   0,
      availTop:    0,
      colorDepth:  TAB.colorDepth,
      pixelDepth:  TAB.colorDepth,
    };

    for (const [prop, value] of Object.entries(screenProps)) {
      try {
        defProp(Screen.prototype, prop, { get: function () { return value; } });
      } catch (_) {
        try {
          Object.defineProperty(screen, prop, {
            get: markNative(function () { return value; }, `get ${prop}`),
            configurable: true,
          });
        } catch (_) {}
      }
    }

    try {
      defProp(window, 'devicePixelRatio', { get: function () { return TAB.dpr; } });
      defProp(window, 'outerWidth',       { get: function () { return TAB.screenW; } });
      defProp(window, 'outerHeight',      { get: function () { return TAB.screenH; } });
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 12: GEOLOCATION SPOOFING (per-tab city + micro-jitter)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('geolocation')) {
    const DENIED = {
      code: 1, message: 'User denied Geolocation',
      PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    };

    // Resolved at CALL time so popup changes apply without a reload:
    //   'deny'   → report a permission denial
    //   'spoof'  → this tab's own city (per-tab profile, default)
    //   'custom' → coordinates configured in the popup
    function positionAt() {
      let lat = TAB.lat;
      let lng = TAB.lng;
      let accuracy = TAB.geoAccuracy;
      if (_prefs.geolocationMode === 'custom') {
        const sl = _prefs.spoofedLocation || {};
        const la = Number(sl.latitude);
        const lo = Number(sl.longitude);
        if (Number.isFinite(la)) lat = Math.min(90, Math.max(-90, la));
        if (Number.isFinite(lo)) lng = Math.min(180, Math.max(-180, lo));
        accuracy = 15;
      }
      return {
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };
    }

    let _watchId = 1;
    const fakeGeo = {
      getCurrentPosition: function getCurrentPosition(success, error) {
        // Native geolocation is asynchronous — deliver callbacks the same way.
        if (_prefs.geolocationMode === 'deny') {
          if (typeof error === 'function') setTimeout(() => error(DENIED), 0);
        } else if (typeof success === 'function') {
          setTimeout(() => success(positionAt()), 0);
        }
      },
      watchPosition: function watchPosition(success, error) {
        const id = _watchId++;
        if (_prefs.geolocationMode === 'deny') {
          if (typeof error === 'function') setTimeout(() => error(DENIED), 0);
        } else if (typeof success === 'function') {
          setTimeout(() => success(positionAt()), 0);
        }
        return id;
      },
      clearWatch: function clearWatch() {},
    };
    markNative(fakeGeo.getCurrentPosition, 'getCurrentPosition');
    markNative(fakeGeo.watchPosition, 'watchPosition');
    markNative(fakeGeo.clearWatch, 'clearWatch');

    try {
      defProp(Navigator.prototype, 'geolocation', { get: function () { return fakeGeo; } });
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 13: TIMEZONE & Intl SPOOFING (per-tab timezone)
  // ═══════════════════════════════════════════════════════════════════════════

  if (on('timezone')) {
    // Compute spoofed offset in minutes (getTimezoneOffset sign convention)
    function calcOffset(tz, ms) {
      try {
        const sample = new Date(ms);
        const utcMs = Date.parse(sample.toLocaleString('en-US', { timeZone: 'UTC' }));
        const localMs = Date.parse(sample.toLocaleString('en-US', { timeZone: tz }));
        return (utcMs - localMs) / 60000;
      } catch (_) { return 0; }
    }

    // Resolved lazily: 'auto' (or no pushed settings yet) → this tab's city
    // timezone; otherwise the fixed timezone chosen in the popup.
    function currentTZ() {
      const t = _prefs.timezone;
      return typeof t === 'string' && t && t !== 'auto' ? t : TAB.timezone;
    }

    const _offsetCache = new Map();
    const _zoneNameCache = new Map();
    function dateCacheKey(tz, ms) {
      const d = new Date(ms);
      return tz + '|' + d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate();
    }
    function offsetFor(tz, ms) {
      const key = dateCacheKey(tz, ms);
      if (!_offsetCache.has(key)) _offsetCache.set(key, calcOffset(tz, ms));
      return _offsetCache.get(key);
    }
    function zoneNameFor(tz, ms) {
      const key = dateCacheKey(tz, ms);
      if (!_zoneNameCache.has(key)) {
        let name = '';
        try {
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date(ms));
          const p = parts.find((pp) => pp.type === 'timeZoneName');
          name = p ? p.value : '';
        } catch (_) {}
        _zoneNameCache.set(key, name);
      }
      return _zoneNameCache.get(key);
    }

    // Date.prototype.getTimezoneOffset
    Object.defineProperty(Date.prototype, 'getTimezoneOffset', {
      value: markNative(function getTimezoneOffset() {
        return offsetFor(currentTZ(), this.getTime());
      }, 'getTimezoneOffset'),
      writable: true,
      configurable: true,
    });

    // Date.prototype.toString family — without this patch the raw date string
    // still prints the REAL system zone ("... GMT+0300 (...)"), a classic
    // bypass of getTimezoneOffset-only spoofers.
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const p2 = (n) => String(n).padStart(2, '0');

    function specStamp(ms, wantDate, wantTime) {
      const off = offsetFor(currentTZ(), ms); // minutes; local wall clock = ms - off
      const d = new Date(ms - off * 60000);
      const out = [];
      if (wantDate) {
        out.push(`${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${p2(d.getUTCDate())} ${d.getUTCFullYear()}`);
      }
      if (wantTime) {
        const a = Math.abs(off);
        out.push(
          `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} ` +
          `GMT${off > 0 ? '-' : '+'}${p2(Math.floor(a / 60))}${p2(a % 60)}`
        );
      }
      return out.join(' ');
    }

    for (const [method, wantDate, wantTime, withName] of [
      ['toString', true, true, true],
      ['toDateString', true, false, false],
      ['toTimeString', false, true, true],
    ]) {
      Object.defineProperty(Date.prototype, method, {
        value: markNative(function () {
          const timeMs = this.getTime();
          const s = specStamp(timeMs, wantDate, wantTime);
          return withName ? s + ' (' + zoneNameFor(currentTZ(), timeMs) + ')' : s;
        }, method),
        writable: true,
        configurable: true,
      });
    }

    // Intl.DateTimeFormat constructor
    const _OrigDTF = Intl.DateTimeFormat;

    const PatchedDTF = function DateTimeFormat(locales, options) {
      const opts = options ? { ...options } : {};
      if (opts.timeZone === undefined) opts.timeZone = currentTZ();
      return new _OrigDTF(locales, opts);
    };
    PatchedDTF.prototype          = _OrigDTF.prototype;
    PatchedDTF.supportedLocalesOf = markNative(
      _OrigDTF.supportedLocalesOf.bind(_OrigDTF), 'supportedLocalesOf'
    );
    markNative(PatchedDTF, 'DateTimeFormat');
    Intl.DateTimeFormat = PatchedDTF;
    // Normalize other Intl constructors too. Otherwise NumberFormat,
    // Collator, PluralRules, etc. can expose the real system locale even though
    // navigator.language and Accept-Language are standardized.
    const DEFAULT_INTL_LOCALE_CONSTRUCTORS = [
      'NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat',
      'ListFormat', 'DisplayNames', 'Segmenter', 'DurationFormat',
    ];
    for (const name of DEFAULT_INTL_LOCALE_CONSTRUCTORS) {
      const Original = Intl[name];
      if (typeof Original !== 'function') continue;
      try {
        const Wrapped = function (locales, options) {
          const normalizedLocales = locales === undefined ? 'en-US' : locales;
          return new Original(normalizedLocales, options);
        };
        Wrapped.prototype = Original.prototype;
        if (typeof Original.supportedLocalesOf === 'function') {
          Wrapped.supportedLocalesOf = markNative(
            Original.supportedLocalesOf.bind(Original), 'supportedLocalesOf'
          );
        }
        markNative(Wrapped, name);
        Intl[name] = Wrapped;
      } catch (_) {}
    }

    // No resolvedOptions() patch needed: instances created without an
    // explicit timeZone already got currentTZ() injected by the constructor,
    // so the real resolved zone IS the spoofed one. Instances with an
    // explicit zone don't leak the system zone either — leave them consistent.

    // Locale-aware Date string methods
    for (const method of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
      const _orig = Date.prototype[method];
      Object.defineProperty(Date.prototype, method, {
        value: markNative(function (...args) {
          if (!args[1]) args[1] = { timeZone: currentTZ() };
          else if (args[1].timeZone === undefined) args[1] = { ...args[1], timeZone: currentTZ() };
          return _orig.apply(this, args);
        }, method),
        writable: true,
        configurable: true,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: REGISTER PROFILE WITH BRIDGE (→ background → popup)
  // ═══════════════════════════════════════════════════════════════════════════

  // Register this tab's identity with the background (via bridge.js) so HTTP
  // request headers can be rewritten to match the JS-level profile.
  // Only the top frame registers: iframes share the tab's network identity
  // while each frame rolls its own profile — letting frames register would
  // ping-pong the tab's header rules.
  if (window.top === window.self) {
    try {
      window.postMessage({
        __privacyShield: true,
        type: 'REGISTER_PROFILE',
        profile: {
          ua:         TAB.ua,
          platform:   TAB.platform,
          city:       TAB.city,
          timezone:   TAB.timezone,
          languages:  [...TAB.languages],
          brands:     TAB.uaBrands.map((b) => ({ brand: b.brand, version: b.version })),
          uaPlatform: TAB.uaPlatform,
          uaMobile:   TAB.uaMobile,
        },
      }, '*');
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: SETTINGS SYNC FROM BACKGROUND (authenticated bridge messages)
  // ═══════════════════════════════════════════════════════════════════════════

  let _settingsVerifyKey = null;
  let _lastSettingsSequence = 0;

  function persistCfg() {
    // Intentionally no-op. Security state must never be persisted in page-owned storage.
  }

  function base64ToBytes(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const raw = atob(value);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      return bytes;
    } catch (_) {
      return null;
    }
  }

  async function importVerifyKey(publicKeyJwk) {
    if (_settingsVerifyKey || !publicKeyJwk || typeof publicKeyJwk !== 'object') return;
    try {
      _settingsVerifyKey = await crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      try {
        window.postMessage({ __privacyShield: true, type: 'REQUEST_SETTINGS' }, '*');
      } catch (_) {}
    } catch (_) {
      _settingsVerifyKey = null;
    }
  }

  function applyAuthenticatedSettings(s) {
    try {
      if (!s || typeof s !== 'object') return;

      if (typeof s.enabled === 'boolean') _modules.enabled = s.enabled;
      if (s.modules && typeof s.modules === 'object') Object.assign(_modules, s.modules);
      if (s.geolocationMode === 'deny' || s.geolocationMode === 'spoof' || s.geolocationMode === 'custom') {
        _prefs.geolocationMode = s.geolocationMode;
      }
      if (typeof s.timezone === 'string' && s.timezone) _prefs.timezone = s.timezone;
      if (s.spoofedLocation && typeof s.spoofedLocation === 'object') {
        _prefs.spoofedLocation = s.spoofedLocation;
      }
      if (Array.isArray(s.excludedDomains)) {
        _prefs.excludedDomains = s.excludedDomains
          .filter(function (domain) { return typeof domain === 'string'; })
          .map(function (domain) { return domain.toLowerCase(); })
          .slice(0, 100);
      }
      if (s.networkPrivacy && typeof s.networkPrivacy === 'object') {
        _prefs.networkPrivacy = { mode: 'direct_hardened' };
      }
      _prefs.securityMode = typeof s.securityMode === 'string' ? s.securityMode : _prefs.securityMode;
      persistCfg();
    } catch (_) {}
  }

  async function verifyAndApplySettings(message) {
    if (!_settingsVerifyKey) return;
    if (!Number.isSafeInteger(message.sequence) || message.sequence <= _lastSettingsSequence) return;
    if (typeof message.payload !== 'string' || !message.payload) return;

    const signatureBytes = base64ToBytes(message.signature);
    if (!signatureBytes) return;

    try {
      const payload = JSON.parse(message.payload);
      if (!payload || payload.sequence !== message.sequence || !payload.settings) return;
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        _settingsVerifyKey,
        signatureBytes,
        new TextEncoder().encode(message.payload)
      );
      if (!valid || message.sequence <= _lastSettingsSequence) return;
      _lastSettingsSequence = message.sequence;
      applyAuthenticatedSettings(payload.settings);
    } catch (_) {}
  }

  window.addEventListener('message', function onSettingsMessage(event) {
    if (event.source !== window) return;
    const d = event.data;
    if (!d) return;

    if (d.__privacyShieldType === 'SETTINGS_VERIFY_KEY') {
      void importVerifyKey(d.publicKeyJwk);
      return;
    }

    if (d.__privacyShieldType === 'ROTATE_IDENTITY') {
      // Rotation is intentionally document-local and never trusts page data.
      return;
    }

    if (d.__privacyShieldType === 'SETTINGS_UPDATE') {
      void verifyAndApplySettings(d);
    }
  });


})();