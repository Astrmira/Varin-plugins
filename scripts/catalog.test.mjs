import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, buildCatalog, validateEntry } from './catalog.mjs';
const listing = () => ({ id: 'dev.example.weather', displayName: 'Weather', description: 'Current weather', author: 'Example', categories: ['Utilities'], keywords: ['forecast'], icon: 'assets/weather.svg', repository: 'https://github.com/example/weather', source: { kind: 'github-release', specifier: 'example/weather#stable?tagPrefix=weather-v&manifest=weather.release.json', display: 'example/weather' } });

test('static catalog and site share data, with content identity covering icons and listing text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'varin-market-'));
  try {
    for (const name of ['entries', 'assets', 'site']) await mkdir(join(root, name));
    await writeFile(join(root, 'entries/dev.example.weather.json'), JSON.stringify(listing()));
    await writeFile(join(root, 'assets/weather.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
    await writeFile(join(root, 'site/index.html'), '<title>Market</title>');
    const first = await build(root);
    assert.equal(first.entries[0].icon, '../assets/weather.svg');
    assert.equal(await readFile(join(root, 'catalog/v1.json'), 'utf8'), await readFile(join(root, 'dist/catalog/v1.json'), 'utf8'));
    assert.equal((await buildCatalog(root)).contentVersion, first.contentVersion);
    await writeFile(join(root, 'assets/weather.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1"/></svg>');
    assert.notEqual((await buildCatalog(root)).contentVersion, first.contentVersion);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('listing references cannot smuggle version mirrors, credentials or local paths', () => {
  assert.equal(validateEntry(listing()).source.kind, 'github-release');
  for (const patch of [ { latestVersion: '1.0.0' }, { icon: 'assets/../private.svg' }, { repository: 'https://token@github.com/example/weather' }, { source: { kind: 'local', specifier: '/private', display: 'Local' } }, { source: { kind: 'npm', specifier: 'https://registry.example/private?token=secret', display: 'npm' } } ]) {
    assert.throws(() => validateEntry({ ...listing(), ...patch }));
  }
});
test('no fabricated example is published in the initial directory', async () => {
  const catalog = await buildCatalog();
  assert.deepEqual(catalog.entries, []);
});
