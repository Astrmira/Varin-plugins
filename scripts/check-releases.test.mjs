import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { c as createTar } from 'tar';
import { checkEntry, inspectArchive, publicReleaseFetch } from './check-releases.mjs';

async function archive(t, { link = false, missing = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'varin-catalog-check-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'package'));
  await writeFile(join(directory, 'package/varin.extension.json'), JSON.stringify({ schemaVersion: 1, id: 'dev.example.weather', version: '1.0.0', engines: { varin: '^1.0.0' }, entrypoints: { host: { mode: 'brokered', file: 'host.cjs' } } }));
  if (!missing) await writeFile(join(directory, 'package/host.cjs'), 'throw new Error("must not execute");');
  if (link) await symlink('/tmp', join(directory, 'package/escape'));
  const file = join(directory, 'release.tgz');
  await createTar({ cwd: directory, file, gzip: true }, ['package']);
  return file;
}
const entry = JSON.parse(await readFile(new URL('../examples/dev.example.weather.json', import.meta.url), 'utf8'));

test('changed entry validation verifies authored manifest, every package digest and executable presence without loading code', async t => {
  const bytes = await readFile(await archive(t));
  let corrupted = false;
  const fetcher = async url => {
    if (url.includes('/releases?')) return Response.json([{ tag_name: 'v1.0.0', draft: false, prerelease: false, assets: [
      { name: 'varin.release.json', browser_download_url: 'https://github.com/example/release.json' },
      { name: 'plugin.tgz', browser_download_url: 'https://github.com/example/plugin.tgz' },
    ] }]);
    if (url.endsWith('.json')) return Response.json({ schemaVersion: 1, extensionId: entry.id, version: '1.0.0', engines: { varin: '^1.0.0' },
      assets: [{ file: 'plugin.tgz', sha256: createHash('sha256').update(bytes).digest('hex'), platform: 'any', arch: 'any' }] });
    return new Response(corrupted ? 'bad bytes' : bytes);
  };
  const checked = await checkEntry(entry, fetcher);
  assert.equal(checked[0].entrypoints, 1);
  corrupted = true;
  await assert.rejects(checkEntry(entry, fetcher), /checksum mismatch/);
});

test('archive inspection rejects links, absent entrypoints and changed identity', async t => {
  const expected = { extensionId: entry.id, version: '1.0.0' };
  await assert.rejects(inspectArchive(await archive(t, { link: true }), expected), /Unsafe release archive/);
  await assert.rejects(inspectArchive(await archive(t, { missing: true }), expected), /Missing prebuilt/);
  await assert.rejects(inspectArchive(await archive(t), { ...expected, extensionId: 'different.id' }), /disagrees/);
});

test('upstream redirects cannot access private destinations or forward embedded credentials', async () => {
  await assert.rejects(publicReleaseFetch('https://github.com/author/archive', async () => new Response(null, { status: 302, headers: { location: 'https://localhost/internal' } })), /approved public/);
  await assert.rejects(publicReleaseFetch('https://secret@github.com/author/archive'), /approved public/);
});

test('public npm spaced range resolves consistently with the installation contract', async t => {
  const bytes = await readFile(await archive(t));
  const listing = { ...entry, source: { kind: 'npm', display: 'Weather', specifier: '@example/weather@>=1.0.0 <2.0.0' } };
  const request = async url => url.endsWith('.tgz') ? new Response(bytes) : Response.json({ 'dist-tags': {}, versions: {
    '2.0.0': { dist: { tarball: 'https://registry.npmjs.org/unused.tgz', integrity: 'invalid' } },
    '1.0.0': { dist: { tarball: 'https://registry.npmjs.org/weather.tgz', integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } },
  } });
  assert.equal((await checkEntry(listing, request))[0].version, '1.0.0');
  await assert.rejects(checkEntry({ ...listing, source: { ...listing.source, specifier: '@example/weather@>=oops' } }, request), /valid SemVer/);
});
