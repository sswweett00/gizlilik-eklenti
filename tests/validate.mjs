import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const headerRules = JSON.parse(read('rules/rules.json'));
const trackerRules = JSON.parse(read('rules/trackers.json'));
const networkRules = JSON.parse(read('rules/network.json'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '4.3.0');
assert.deepEqual(
  manifest.permissions,
  ['privacy', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'storage', 'tabs']
);

const worlds = manifest.content_scripts.map((entry) => ({
  world: entry.world,
  files: entry.js,
}));
assert.deepEqual(worlds[0], { world: 'ISOLATED', files: ['bridge.js'] });
assert.deepEqual(worlds[1], { world: 'MAIN', files: ['inject.js'] });

for (const path of ['background.js', 'bridge.js', 'inject.js', 'popup.js']) {
  assert.doesNotThrow(() => new Function(read(path)), path + ' should parse as JavaScript');
}

for (const [name, rules] of [['header', headerRules], ['tracker', trackerRules], ['network', networkRules]]) {
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
assert.ok(!/header":\s*"Accept-Language"/.test(headerSource), 'static rules must not hard-code Accept-Language');

const background = read('background.js');
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

assert.ok(!manifest.permissions.includes('proxy'), 'implementation must not require the proxy API');
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

const backgroundSource = read('background.js');
const injectSource = read('inject.js');
const popupSource = read('popup.html') + '\n' + read('popup.js');

for (const forbidden of ['chrome.proxy', 'proxy_required', 'ipProtection', 'proxyHost', 'proxyPort', 'proxyScheme']) {
  assert.ok(!backgroundSource.includes(forbidden), 'background contains removed proxy surface: ' + forbidden);
  assert.ok(!injectSource.includes(forbidden), 'inject contains removed proxy surface: ' + forbidden);
  assert.ok(!popupSource.includes(forbidden), 'popup contains removed proxy surface: ' + forbidden);
}

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
assert.ok(!injectSource.includes("setLocalDescription', function"), 'strict mode must not patch setLocalDescription at all');
assert.ok(injectSource.includes('WebTransport disabled by Privacy Shield.'), 'WebTransport must be hard-blocked in the page world');
assert.ok(injectSource.includes('WebSocket disabled by Privacy Shield.'), 'WebSocket must be hard-blocked in the page world');
assert.ok(injectSource.includes("function sendBeacon() { return false; }"), 'sendBeacon must be disabled in maximum direct mode');
assert.ok(popupSource.includes('Direct Network Privacy'), 'popup must explain direct-connection privacy semantics');
assert.ok(popupSource.includes('Visible to destination'), 'popup must not falsely claim direct-IP anonymity');
assert.ok(backgroundSource.includes("securityMode: 'maximum_direct'"), 'maximum direct security mode must be the default');
assert.ok(backgroundSource.includes("geolocationMode: 'deny'"), 'geolocation must be deny-by-default');
assert.ok(new Set([...headerRules, ...trackerRules, ...networkRules].map((rule) => rule.id)).size === headerRules.length + trackerRules.length + networkRules.length, 'all static DNR rule IDs must be globally unique');
assert.ok(backgroundSource.includes("normalized.modules[key] = true"), 'maximum mode must lock all modules on');
assert.ok(injectSource.includes("securityMode: 'maximum_direct'"), 'injector must default to maximum direct mode');
assert.ok(injectSource.includes('crypto.getRandomValues'), 'identity seed must prefer Web Crypto entropy');
assert.ok(injectSource.includes('const actualUA = String(navigator.userAgent || \'\');'), 'page identity must derive from native UA');
assert.ok(!injectSource.includes('const fakeUAData ='), 'Client Hints must not be replaced with a cross-platform fake profile');
assert.ok(!backgroundSource.includes("{ header: 'User-Agent', operation: 'set'"), 'session rules must not rewrite User-Agent');
assert.ok(!backgroundSource.includes("{ header: 'Accept-Language', operation: 'set'"), 'session rules must not rewrite Accept-Language');
assert.ok(!backgroundSource.includes('SESSION_RULE_ID_BASE'), 'legacy session header engine must be removed');
assert.ok(!backgroundSource.includes('buildHeadersForProfile'), 'legacy per-tab header builder must be removed');
assert.ok(injectSource.includes("defProp(Navigator.prototype, 'gpu'"), 'WebGPU must be blocked in maximum direct mode');
assert.ok(headerSource.includes('X-DNS-Prefetch-Control'), 'response rules must disable DNS prefetch hints');
assert.ok(backgroundSource.includes("type !== 'webtransport' && type !== 'ping'"), 'site exceptions must not bypass critical transport/privacy blocks');
assert.ok(popupSource.includes('Maximum direct mode'), 'popup must expose the maximum direct security posture');

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

console.log('Privacy Shield v3.0 static validation passed.');
