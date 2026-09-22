import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const headerRules = JSON.parse(read('rules/rules.json'));
const trackerRules = JSON.parse(read('rules/trackers.json'));
const networkRules = JSON.parse(read('rules/network.json'));
const adRules = JSON.parse(read('rules/adblock.json'));
const urlRules = JSON.parse(read('rules/url-cleaner.json'));
const permissionRules = JSON.parse(read('rules/permissions.json'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '4.8.0');
assert.deepEqual(
  manifest.permissions,
  ['privacy', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'declarativeNetRequestFeedback', 'storage', 'tabs', 'contentSettings', 'proxy']
);

const worlds = manifest.content_scripts.map((entry) => ({
  world: entry.world,
  files: entry.js,
}));
assert.deepEqual(worlds[0], { world: 'ISOLATED', files: ['bridge.js'] });
assert.deepEqual(worlds[1], { world: 'MAIN', files: ['inject.js'] });

for (const path of ['background.js', 'bridge.js', 'inject.js', 'popup.js']) {
  assert.doesNotThrow(
    () => execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' }),
    path + ' should parse as JavaScript/module'
  );
}

for (const [name, rules] of [['header', headerRules], ['permission', permissionRules], ['tracker', trackerRules], ['ad', adRules], ['network', networkRules], ['url', urlRules]]) {
  const ids = rules.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length, name + ' rule IDs must be unique');
  for (const rule of rules) {
    assert.equal(typeof rule.id, 'number');
    assert.equal(typeof rule.priority, 'number');
    assert.ok(rule.action?.type);
    assert.ok(rule.condition?.resourceTypes?.length);
  }
}

const headerSource = read('rules/rules.json');
assert.ok(!/header":\s*"User-Agent"/.test(headerSource), 'static rules must not hard-code a global User-Agent');
assert.ok(/header":\s*"Accept-Language"/.test(headerSource), 'locale policy must explicitly standardize Accept-Language');
assert.ok(headerRules[0].action.requestHeaders.some((h) => h.header === 'DNT' && h.operation === 'set' && h.value === '1'), 'DNT must be explicitly enabled');
assert.ok(headerRules[0].action.requestHeaders.some((h) => h.header === 'Sec-GPC' && h.operation === 'set' && h.value === '1'), 'GPC must be explicitly enabled');
assert.ok(headerRules[0].action.requestHeaders.some((h) => h.header === 'Referer' && h.operation === 'remove'), 'Referer must be removed');
assert.ok(headerSource.includes('en-US,en;q=0.9'), 'Accept-Language must use the standardized locale profile');

const background = read('background.js');
const backgroundSource = background;
const injectSource = read('inject.js');
const popupSource = read('popup.html') + '\n' + read('popup.js');
assert.ok(background.includes('function enqueue('), 'background must define enqueue before use');
assert.ok(background.includes('let settingsApplyQueue = Promise.resolve();'), 'background must serialize settings reapply operations');
assert.ok(background.includes('await rebuildAllSessionRules();'), 'background must rebuild session rules during settings reapply');
for (const marker of [
  'applySiteExceptionRules',
  'settingsRequireReload',
  'reloadProtectionTabs',
  "case 'TOGGLE_SITE_EXCLUSION'",
  "case 'ROTATE_IDENTITY'",
]) {
  assert.ok(background.includes(marker), 'background missing ' + marker);
}

const inject = read('inject.js');
for (const marker of [
  'buildNoisedCanvas',
  "OfflineAudioContext.prototype",
  "on('permissions')",
  'dateCacheKey',
  'excludedDomains',
]) {
  assert.ok(inject.includes(marker), 'inject missing ' + marker);
}

const popup = read('popup.html') + '\n' + read('popup.js');
for (const marker of ['siteExceptionBtn', 'rotateIdentityBtn', 'rulesetValue', 'permissions']) {
  assert.ok(popup.includes(marker), 'popup missing ' + marker);
}

console.log('Privacy Shield static validation passed.');

assert.ok(manifest.permissions.includes('proxy'), 'local Tor mode must request the Chrome proxy API');
assert.equal(manifest.content_security_policy?.extension_pages, "script-src 'self'; object-src 'self';", 'extension-page CSP must block inline/eval script');
assert.ok(!backgroundSource.includes('chrome.storage.sync'), 'settings must remain local-only');
assert.ok(backgroundSource.includes("wanted.push('ad_rules')"), 'background must enable ad rules');
assert.ok(backgroundSource.includes("wanted.push('url_rules')"), 'background must enable URL rules');
assert.ok(urlRules.length >= 18, 'URL cleaner must split tracking matching into small rules');
assert.ok(urlRules.every((rule) => typeof rule.condition?.regexFilter === 'string'), 'URL cleaner rules must use explicit regex filters');
assert.ok(urlRules.every((rule) => rule.condition.regexFilter.length < 256), 'URL cleaner regex filters must remain small');
assert.ok(urlRules.some((rule) => rule.condition.regexFilter.includes('fbclid')), 'URL cleaner must match fbclid');
assert.ok(urlRules.every((rule) => rule.action?.redirect?.transform?.queryTransform?.removeParams?.includes('fbclid')), 'URL cleaner must remove fbclid');
assert.ok(adRules.some((rule) => rule.action?.type === 'block'), 'ad rules must contain blocking rules');
assert.ok(trackerRules[0].condition.requestDomains.includes('analytics.tiktok.com'), 'tracker rules must include modern telemetry endpoints');
assert.ok(trackerRules[0].condition.requestDomains.includes('ads.linkedin.com'), 'tracker rules must include LinkedIn telemetry endpoints');
assert.ok(adRules[0].condition.requestDomains.includes('securepubads.g.doubleclick.net'), 'ad rules must include common publisher ad endpoints');
assert.ok(
  networkRules.some((rule) => rule.action?.type === 'block' && rule.condition?.resourceTypes?.includes('webtransport')),
  'WebTransport must be blocked in hardened network mode'
);
assert.ok(
  networkRules.some((rule) => rule.action?.type === 'block' && rule.condition?.resourceTypes?.includes('ping')),
  'beacon/ping telemetry must be blocked in hardened network mode'
);
assert.ok(
  networkRules.some((rule) => rule.action?.type === 'block' && rule.condition?.resourceTypes?.includes('websocket')),
  'WebSocket must be blocked in hardened network mode'
);



assert.ok(backgroundSource.includes('chrome.proxy.settings.set'), 'background must configure the browser proxy in local Tor mode');
assert.ok(backgroundSource.includes("networkPrivacy?.mode === 'local_tor'") || backgroundSource.includes("networkPrivacy.mode === 'local_tor'"), 'background must support local Tor mode');
assert.ok(backgroundSource.includes("scheme: 'socks5'"), 'local Tor mode must use SOCKS5');
assert.ok(backgroundSource.includes('127.0.0.1'), 'local Tor mode must target localhost only');
assert.ok(!/fallbackProxy\s*:/.test(backgroundSource), 'local Tor mode must not configure a fallback proxy');
assert.ok(backgroundSource.includes('TOR_KILL_SWITCH_RULE_ID'), 'local Tor mode must define a network kill-switch');
assert.ok(backgroundSource.includes("regexFilter: '^https?://'"), 'Tor kill-switch must block direct HTTP(S) traffic');
assert.ok(backgroundSource.includes('setTorKillSwitch(true)'), 'Tor failures must activate the kill-switch');
assert.ok(popupSource.includes('Verify Tor'), 'popup must expose Tor verification');
assert.ok(popupSource.includes('Local Tor'), 'popup must expose local Tor path selection');

for (const marker of [
  'networkPrivacy',
  'HARDENED_PRIVACY_ITEMS',
  'websites.topicsEnabled',
  'websites.fledgeEnabled',
  'websites.adMeasurementEnabled',
  'services.passwordSavingEnabled',
]) {
  assert.ok(backgroundSource.includes(marker), 'background missing hardened privacy control: ' + marker);
}

assert.ok(injectSource.includes('const strictIpLock = true;'), 'WebRTC must be hard-blocked in direct privacy mode');
assert.ok(injectSource.includes("_prefs.geolocationMode === 'deny'"), 'geolocation API must deny by default');
assert.ok(/descriptor\s*&&\s*\[?'?geolocation'?/.test(injectSource) || injectSource.includes("'geolocation', 'camera', 'microphone'"), 'geolocation permission state must be controlled');
assert.ok(!injectSource.includes("setLocalDescription', function"), 'strict mode must not patch setLocalDescription at all');
assert.ok(injectSource.includes('WebTransport disabled by Privacy Shield.'), 'WebTransport must be hard-blocked in the page world');
assert.ok(injectSource.includes('WebSocket disabled by Privacy Shield.'), 'WebSocket must be hard-blocked in the page world');
assert.ok(injectSource.includes('EventSource disabled by Privacy Shield.'), 'EventSource must be hard-blocked in the page world');
assert.ok(injectSource.includes('Media capture disabled by Privacy Shield.'), 'camera/microphone capture must be blocked in maximum direct mode');
assert.ok(injectSource.includes("function sendBeacon() { return false; }"), 'sendBeacon must be disabled in maximum direct mode');
assert.ok(popupSource.includes('Direct Network Privacy'), 'popup must explain direct-connection privacy semantics');
assert.ok(popupSource.includes('Visible in direct mode'), 'popup must not falsely claim direct-IP anonymity');
assert.ok(popupSource.includes('IP-location'), 'popup must disclose the IP-location limitation');
assert.ok(backgroundSource.includes("securityMode: 'maximum_direct'"), 'maximum direct security mode must be the default');
assert.ok(backgroundSource.includes("mode: 'direct_hardened'"), 'direct hardened network mode must remain the default');
assert.ok(backgroundSource.includes('torPort: 9050'), 'Tor service port 9050 must be supported');
assert.ok(backgroundSource.includes('CHECK_TOR'), 'background must expose fail-closed Tor verification');
assert.ok(backgroundSource.includes("geolocationMode: 'deny'"), 'geolocation must be deny-by-default');
assert.ok(new Set([...headerRules, ...permissionRules, ...trackerRules, ...networkRules, ...urlRules].map((rule) => rule.id)).size === headerRules.length + permissionRules.length + trackerRules.length + networkRules.length + urlRules.length, 'all static DNR rule IDs must be globally unique');
assert.ok(permissionRules.some((rule) => rule.action?.responseHeaders?.some((h) => h.header === 'Permissions-Policy' && h.operation === 'set')), 'permission rules must enforce a Permissions-Policy response header');
assert.ok(backgroundSource.includes('trackers: true'), 'tracker blocking must be independently configurable');
assert.ok(backgroundSource.includes('ads: true'), 'ad blocking must be independently configurable');
assert.ok(backgroundSource.includes('urlCleaner: true'), 'URL cleaning must be independently configurable');
assert.ok(backgroundSource.includes('browserPrivacy: true'), 'browser privacy must be independently configurable');
assert.ok(backgroundSource.includes('if (s.modules.trackers) wanted.push'), 'tracker ruleset must follow its toggle');
assert.ok(backgroundSource.includes('if (s.modules.ads) wanted.push'), 'ad ruleset must follow its toggle');
assert.ok(backgroundSource.includes('if (s.modules.urlCleaner) wanted.push'), 'URL cleaner ruleset must follow its toggle');
assert.ok(backgroundSource.includes('function privacyModuleForKey'), 'privacy API settings must follow module toggles');
assert.ok(backgroundSource.includes('HARDENED_CONTENT_SETTINGS'), 'browser-level content settings must enforce privacy');
assert.ok(backgroundSource.includes('const SITE_EXCEPTION_RESOURCE_TYPES'), 'site exception resource types must be explicit');
assert.ok(!backgroundSource.includes('RESOURCE_TYPES.filter'), 'site exceptions must not reference an undefined resource type list');
assert.ok(backgroundSource.includes('await rebuildAllSessionRules();'), 'settings reapply must clear stale session rules');
assert.ok(!backgroundSource.includes("Site exceptions are disabled in maximum direct mode."), 'site exceptions must no longer be hard-locked by security mode');
assert.ok(injectSource.includes("securityMode: 'maximum_direct'"), 'injector must default to maximum direct mode');
assert.ok(injectSource.includes('crypto.getRandomValues'), 'identity seed must prefer Web Crypto entropy');
assert.ok(!injectSource.includes('Math.random('), 'privacy seed generation must not fall back to Math.random');
assert.ok(!injectSource.includes("sessionStorage.getItem(STORAGE_KEY)"), 'profile state must not trust page-controlled sessionStorage');
assert.ok(!injectSource.includes("sessionStorage.setItem(STORAGE_KEY"), 'profile state must not persist into page-controlled sessionStorage');
assert.ok(!injectSource.includes("sessionStorage.getItem('__ps_cfg')"), 'security settings must not trust page-controlled sessionStorage');
assert.ok(injectSource.includes('getHighEntropyValues'), 'high-entropy Client Hints must be controlled');
assert.ok(injectSource.includes('Sensor API disabled by Privacy Shield.'), 'sensor APIs must be blocked');
assert.ok(injectSource.includes('Credential access'), 'credential APIs must be blocked');
assert.ok(injectSource.includes('Storage Access API'), 'Storage Access API must be blocked');
assert.ok(injectSource.includes('Keyboard layout'), 'keyboard layout fingerprinting must be blocked');
assert.ok(injectSource.includes('Media capabilities'), 'media capability fingerprinting must be blocked');
assert.ok(injectSource.includes("['geolocation', 'camera', 'microphone', 'notifications', 'push', 'midi']"), 'sensitive permission states must be normalized to denied');
assert.ok(injectSource.includes('Service Workers'), 'service-worker registration must be blocked');
assert.ok(injectSource.includes('Push subscription'), 'push subscriptions must be blocked');
assert.ok(injectSource.includes('const actualUA = String(navigator.userAgent || \'\');'), 'page identity must derive from native UA');
assert.ok(injectSource.includes("lang: 'en-US'"), 'maximum mode must standardize page locale');
assert.ok(injectSource.includes("langs: ['en-US', 'en']"), 'maximum mode must standardize navigator languages');
assert.ok(injectSource.includes('DEFAULT_INTL_LOCALE_CONSTRUCTORS'), 'Intl locale fingerprint surfaces must be standardized');
assert.ok(!injectSource.includes('const fakeUAData ='), 'Client Hints must not be replaced with a cross-platform fake profile');
assert.ok(!backgroundSource.includes("{ header: 'User-Agent', operation: 'set'"), 'session rules must not rewrite User-Agent');
assert.ok(!backgroundSource.includes("{ header: 'Accept-Language', operation: 'set'"), 'session rules must not rewrite Accept-Language');
assert.ok(!backgroundSource.includes('SESSION_RULE_ID_BASE'), 'legacy session header engine must be removed');
assert.ok(!backgroundSource.includes('buildHeadersForProfile'), 'legacy per-tab header builder must be removed');
assert.ok(!read('bridge.js').includes('Math.random()'), 'bridge authentication must not use Math.random entropy');
assert.ok(read('bridge.js').includes("crypto.subtle.generateKey"), 'bridge must generate an isolated-world signing key');
assert.ok(read('bridge.js').includes("crypto.subtle.sign"), 'bridge must sign settings updates');
assert.ok(read('inject.js').includes("crypto.subtle.verify"), 'injector must verify settings signatures');
assert.ok(read('inject.js').includes('SETTINGS_VERIFY_KEY'), 'injector must accept only a public verification key');
assert.ok(injectSource.includes("defProp(Navigator.prototype, 'gpu'"), 'WebGPU must be blocked in maximum direct mode');
assert.ok(injectSource.includes('OffscreenCanvas'), 'OffscreenCanvas fingerprint surface must be controlled');
assert.ok(injectSource.includes('MEDIA_QUERY_OVERRIDES'), 'OS media-query fingerprint preferences must be standardized');

assert.ok(headerSource.includes('X-DNS-Prefetch-Control'), 'response rules must disable DNS prefetch hints');
assert.ok(backgroundSource.includes('const SITE_EXCEPTION_RESOURCE_TYPES'), 'site exceptions must declare an explicit resource allowlist');
assert.ok(!backgroundSource.includes("'webtransport'") || backgroundSource.includes('network_rules'), 'critical transport handling must remain outside site exceptions');
assert.ok(popupSource.includes('Independent controls'), 'popup must expose independent module controls');
assert.ok(popupSource.includes('AEGIS-9'), 'popup must expose the AEGIS-9 system anonymity profile');
for (const path of ['package.json','tsconfig.json','vite.config.ts','manifest.config.ts','src/shared/constants.ts','src/shared/types.ts','src/shared/storage.ts','src/shared/utils.ts','src/background/index.ts','src/background/ruleManager.ts','src/background/urlCleaner.ts','src/background/badgeManager.ts','src/content/content-isolated.ts','src/content/inject-main.iife.ts','src/popup/popup.html','src/popup/popup.ts','src/options/options.html','src/options/options.ts']) {
  assert.ok(fs.existsSync(path), 'typed architecture file missing: ' + path);
}

for (const domain of ['ipapi.co','ipinfo.io','ipwho.is','ip-api.com','ipgeolocation.io','ipdata.co','freeipapi.com','geolocation-db.com','ipapi.com','ip2location.io','api.ipify.org','api64.ipify.org','ipify.org','ifconfig.co','ifconfig.me','icanhazip.com','ident.me','ip.sb','myip.com','checkip.amazonaws.com','checkip.dyndns.org','whatismyip.akamai.com','ipv4.icanhazip.com','ipv6.icanhazip.com','api.my-ip.io','seeip.org','ip.seeip.org','api.myip.com','curlmyip.org','curlmyip.com','eth0.me','ipecho.net','myexternalip.com','wtfismyip.com']) {
  assert.ok(networkRules.some((rule) => rule.condition?.requestDomains?.includes(domain)), 'network rules must block common IP geolocation endpoint: ' + domain);
}

for (const path of [
  'docs/ZERO_COST_DEPLOYMENT.md',
  'docs/THREAT_MODEL.md',
  'docs/VERIFICATION.md',
  'scripts/linux/mac-randomize.sh',
  'scripts/linux/privacy-audit.sh',
  'scripts/windows/privacy-audit.ps1',
  'scripts/macos/privacy-audit.sh',
  'scripts/qubes/aegis-configure.sh',
  'scripts/qubes/aegis-audit.sh',
  'scripts/qubes/aegis-install-whonix.sh',
  'docs/BROWSERLEAKS_REMEDIATION.md',
  'docs/AEGIS9_ARCHITECTURE.md',
]) {
  const source = read(path);
  assert.ok(source.length > 200, 'deployment/security asset must be non-empty: ' + path);
}

assert.ok(read('docs/ZERO_COST_DEPLOYMENT.md').includes('Tails'), 'deployment guide must include Tails');
assert.ok(read('docs/AEGIS9_ARCHITECTURE.md').includes('whonix-workstation-18-dvm'), 'AEGIS architecture must define the Whonix disposable template');
assert.ok(read('scripts/qubes/aegis-configure.sh').includes('default_dispvm whonix-workstation-18-dvm'), 'Qubes hardening must set the Whonix disposable template');
assert.ok(read('scripts/qubes/aegis-install-whonix.sh').includes('whonix-gateway-18 whonix-workstation-18'), 'Qubes installer must target supported Whonix 18 templates');
assert.ok(read('docs/BROWSERLEAKS_REMEDIATION.md').includes('JA3/JA4'), 'BrowserLeaks matrix must document TLS fingerprint boundary');
assert.ok(read('docs/BROWSERLEAKS_REMEDIATION.md').includes('Public IP'), 'BrowserLeaks matrix must document network IP boundary');
assert.ok(read('docs/ZERO_COST_DEPLOYMENT.md').includes('Tor Browser'), 'deployment guide must include Tor Browser');
assert.ok(read('scripts/linux/mac-randomize.sh').includes('cloned-mac-address random'), 'Linux MAC randomization tool must use NetworkManager random MAC');
assert.ok(read('scripts/windows/privacy-audit.ps1').includes('getmac /v'), 'Windows privacy audit must inspect MAC');
assert.ok(read('scripts/macos/privacy-audit.sh').includes('networksetup -listallhardwareports'), 'macOS privacy audit must inspect interfaces');

assert.ok(networkRules.some((rule) => rule.condition?.urlFilter === '||httpbin.org/ip'), 'httpbin IP echo must be blocked');
assert.ok(networkRules.some((rule) => rule.condition?.urlFilter === '||cloudflare.com/cdn-cgi/trace'), 'Cloudflare trace IP endpoint must be blocked');
assert.ok(networkRules.some((rule) => rule.id === 334 && rule.condition?.requestDomains?.includes('eth0.me')), 'additional IP echo services must be blocked');

console.log('Privacy Shield v4.8 static validation passed.');

const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.scripts?.build === 'vite build', 'build script must use Vite');
assert.ok(pkg.scripts?.typecheck === 'tsc --noEmit', 'typecheck script must use TypeScript');
assert.ok(pkg.devDependencies?.['@crxjs/vite-plugin'], 'CRXJS build dependency must exist');
assert.ok(pkg.devDependencies?.vite, 'Vite build dependency must exist');

assert.ok(popupSource.includes('data-key="trackers"'), 'popup must expose tracker toggle');
assert.ok(popupSource.includes('data-key="ads"'), 'popup must expose ad toggle');
assert.ok(popupSource.includes('data-key="urlCleaner"'), 'popup must expose URL cleaner toggle');
assert.ok(popupSource.includes('data-key="browserPrivacy"'), 'popup must expose browser privacy toggle');
