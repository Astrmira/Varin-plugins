import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EXAMPLE_LISTING, parseCatalog, filterEntries, installUrl, inspectDraft, readFilters, writeFilters, isPublicHttps, isAssetPath } from '../site/marketplace.js';
import { validateEntry } from './catalog.mjs';
const github = () => validateEntry(structuredClone(EXAMPLE_LISTING));
const npm = () => validateEntry({ ...EXAMPLE_LISTING, id: 'dev.example.notes', displayName: 'Notes', author: 'Another author', categories: ['Writing'], keywords: ['memo'], source: { kind: 'npm', specifier: '@author/notes@^1.0.0', display: '@author/notes' } });
const document = entries => ({ schemaVersion: 1, entries });

test('browser consumes the real build schema and keeps an empty directory empty', async () => {
  assert.deepEqual(parseCatalog(document([])), []);
  assert.deepEqual(parseCatalog(document([github(), npm()])), [github(), npm()]);
  const published = JSON.parse(await readFile(new URL('../catalog/v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(parseCatalog(published), []);
});
test('catalog fails closed on malformed shapes, unsafe fields, or duplicate IDs', () => {
  for (const value of [null, {}, document({}), { schemaVersion: 2, entries: [] }, document([null]), document([github(), github()]), document([{ ...github(), keywords: null }]), document([{ ...github(), source: { kind: '__proto__' } }]), document([{ ...github(), repository: 'javascript:alert(1)' }]), document([{ ...github(), icon: '../assets/../../private.svg' }])]) assert.throws(() => parseCatalog(value));
  const withoutKeywords = github(); delete withoutKeywords.keywords;
  assert.deepEqual(parseCatalog(document([withoutKeywords]))[0].keywords, []);
});
test('search covers IDs, author, keywords, categories and source, then combines filters', () => {
  const entries = [github(), npm()];
  for (const query of ['  FORECAST ', 'dev.example.weather', 'Utilities', 'example/weather']) assert.equal(filterEntries(entries, { query })[0].id, github().id);
  assert.equal(filterEntries(entries, { query: 'Another author' })[0].id, npm().id);
  assert.equal(filterEntries(entries, { source: 'npm', category: 'Writing', query: 'memo' }).length, 1);
  assert.deepEqual(filterEntries(entries, { source: 'github-release', category: 'Writing' }), []);
  assert.deepEqual(filterEntries(entries, { query: '<script>' }), []);
  assert.equal(filterEntries(entries, { sort: 'author' })[0].author, 'Another author');
  assert.equal(entries[0].id, github().id, 'sorting must not mutate catalog order');
});
test('deep links preserve exact author release source and selectors', () => {
  for (const entry of [npm(), { ...github(), source: { kind: 'github-release', specifier: 'owner/repo#stable?tagPrefix=weather-v&manifest=weather.release.json', display: 'Owner / Weather' } }]) {
    const link = new URL(installUrl(entry));
    assert.equal(link.protocol, 'varin:'); assert.equal(link.hostname, 'extensions'); assert.equal(link.pathname, '/install');
    assert.equal(link.searchParams.get('extensionId'), entry.id);
    assert.deepEqual(JSON.parse(link.searchParams.get('source')), entry.source);
  }
});
test('shareable filters round-trip safely, preserve unrelated URL parameters and hash', () => {
  const filters = { query: '工具 & test', source: 'npm', category: 'Context / Models', sort: 'author' };
  const url = writeFilters('https://example.org/?existing=1#directory', filters);
  assert.deepEqual(readFilters(url.search), filters); assert.equal(url.hash, '#directory'); assert.equal(url.searchParams.get('existing'), '1');
  assert.deepEqual(readFilters('?source=bad&sort=recent'), { query: '', source: '', category: '', sort: 'name' });
  assert.equal(writeFilters(url, { query: '', source: '', category: '', sort: 'name' }).search, '?existing=1');
});
test('listing precheck is local, detects structural errors and does not claim release validation', () => {
  assert.deepEqual(inspectDraft(JSON.stringify(EXAMPLE_LISTING)).errors, []);
  assert.equal(inspectDraft('not json').errors.length, 1);
  assert.equal(inspectDraft('[]').errors.length, 1);
  for (const patch of [{ latestVersion: '1.0.0' }, { categories: ['Utilities', ' Utilities '] }, { author: '' }, { icon: 'https://site.test/icon.svg' }, { homepage: 'https://user:secret@site.test' }, { source: { kind: 'local', specifier: '/tmp', display: 'Local' } }, { source: { kind: 'github-release', specifier: 'owner/repo#stable?manifest=../secret', display: 'Repo' } }, { source: { kind: 'github-release', specifier: 'owner/repo#stable?unknown=x', display: 'Repo' } }]) assert.ok(inspectDraft(JSON.stringify({ ...EXAMPLE_LISTING, ...patch })).errors.length);
  // Full SemVer validation stays in npm run validate; a structural check is not a release approval.
  const invalidSemver = { ...EXAMPLE_LISTING, source: { kind: 'npm', specifier: '@author/weather@not valid range', display: 'Weather' } };
  assert.deepEqual(inspectDraft(JSON.stringify(invalidSemver)).errors, []);
  assert.throws(() => validateEntry(invalidSemver));
});
test('external links and local icons reject scripts, credentials, traversal and remote assets', () => {
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://token@example.org', undefined]) assert.equal(isPublicHttps(url), false);
  assert.equal(isPublicHttps('https://github.com/example/repo'), true);
  for (const path of ['assets/../secret.svg', 'assets/./icon.png', '//host/icon.svg', 'assets/icon.svg?x=1']) assert.equal(isAssetPath(path), false);
  assert.equal(isAssetPath('../assets/icon.svg', true), true);
});
