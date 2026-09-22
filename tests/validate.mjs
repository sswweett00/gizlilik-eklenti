import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const headerRules = JSON.parse(read('rules/rules.json'));
const trackerRules = JSON.parse(read('rules/trackers.json'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '3.0.0');
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

for (const [name, rules] of [['header', headerRules], ['tracker', trackerRules]]) {
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
const networkRules = JSON.parse(read('rules/network.json'));
assert.ok(
  networkRules.some((rule) => rule.action?.type === 'block' && rule.condition?.resourceTypes?.includes('webtransport')),
  'WebTransport must be blocked in hardened network mode'
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
assert.ok(injectSource.includes('WebTransport disabled by Privacy Shield.'), 'WebTransport must be hard-blocked in the page world');
assert.ok(popupSource.includes('Direct Network Privacy'), 'popup must explain direct-connection privacy semantics');
assert.ok(popupSource.includes('Visible to destination'), 'popup must not falsely claim direct-IP anonymity');

console.log('Privacy Shield v3.0 static validation passed.');
