import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const headerRules = JSON.parse(read('rules/rules.json'));
const trackerRules = JSON.parse(read('rules/trackers.json'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '2.3.0');
assert.deepEqual(
  manifest.permissions,
  ['privacy', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'storage', 'tabs', 'proxy']
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

const backgroundSource = read('background.js');
assert.ok(backgroundSource.includes("mode: 'proxy_required'"), 'strict IP protection must be the default');
assert.ok(backgroundSource.includes('PROXY 127.0.0.1:9'), 'missing proxy must fail closed');
assert.ok(backgroundSource.includes('mandatory: true'), 'lock PAC must be mandatory');
assert.ok(backgroundSource.includes('fallbackProxy: proxy'), 'strict proxy mode must cover fallback traffic with the same proxy');
assert.ok(!backgroundSource.includes('direct://'), 'strict mode must not configure DIRECT fallback');

const injectSource = read('inject.js');
assert.ok(injectSource.includes('WebRTC disabled by Privacy Shield IP Lock.'), 'strict IP mode must disable WebRTC');

const popupSource = read('popup.html') + '\n' + read('popup.js');
for (const marker of ['ipProtectionMode', 'proxyScheme', 'proxyHost', 'proxyPort', 'ipLockTitle']) {
  assert.ok(popupSource.includes(marker), 'popup missing ' + marker);
}