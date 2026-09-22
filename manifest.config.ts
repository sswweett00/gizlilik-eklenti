import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

const manifest = {
  manifest_version: 3,
  name: 'Privacy Shield',
  version: pkg.version,
  description: 'AEGIS-9 browser privacy hardening companion with tracker blocking, URL tracking cleanup, fingerprint hardening, and privacy controls.',
  minimum_chrome_version: '128',
  permissions: [
    'privacy',
    'declarativeNetRequest',
    'declarativeNetRequestWithHostAccess',
    'declarativeNetRequestFeedback',
    'storage',
    'tabs',
    'contentSettings',
  ],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    default_title: 'Privacy Shield',
  },
  options_page: 'src/options/options.html',
  content_scripts: [
    {
      js: ['src/content/content-isolated.ts'],
      matches: ['<all_urls>'],
      run_at: 'document_start',
      all_frames: true,
      match_about_blank: true,
      world: 'ISOLATED',
    },
    {
      js: ['src/content/inject-main.iife.ts'],
      matches: ['<all_urls>'],
      run_at: 'document_start',
      all_frames: true,
      match_about_blank: true,
      world: 'MAIN',
    },
  ],
  declarative_net_request: {
    rule_resources: [
      { id: 'header_rules', enabled: true, path: 'rules/rules.json' },
      { id: 'tracker_rules', enabled: true, path: 'rules/trackers.json' },
      { id: 'ad_rules', enabled: true, path: 'rules/adblock.json' },
      { id: 'network_rules', enabled: true, path: 'rules/network.json' },
      { id: 'url_rules', enabled: true, path: 'rules/url-cleaner.json' },
    ],
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
  },
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  browser_specific_settings: {
    gecko: {
      id: 'privacyshield@sswweett00.local',
      strict_min_version: '128.0',
      data_collection_permissions: {
        required: ['none'] as any,
      },
    },
  },
};

export default defineManifest(manifest as any);
