import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { t as listTar } from 'tar';
import semver from 'semver';
import { validateEntry, parseNpmReleaseSource } from './catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hosts = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'registry.npmjs.org']);
export async function publicReleaseFetch(address, fetcher = fetch) {
  const visited = new Set();
  while (true) {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.has(url.hostname)) throw new Error('Release URL must use an approved public GitHub/npm HTTPS host without credentials');
    if (visited.has(url.href)) throw new Error('Release redirect cycle');
    visited.add(url.href);
    const response = await fetcher(url.href, { redirect: 'manual', headers: { Accept: 'application/json' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Release redirect has no location');
      address = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error(`Release upstream returned ${response.status}${response.headers.get('retry-after') ? `; retry after ${response.headers.get('retry-after')}` : ''}`);
    return response;
  }
}

export function verifyIntegrity(bytes, integrity) {
  const tokens = integrity.split(/\s+/).map(token => /^(sha512|sha384|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(token)).filter(Boolean);
  const algorithm = ['sha512', 'sha384', 'sha256'].find(value => tokens.some(token => token[1] === value));
  if (!algorithm || !tokens.some(token => token[1] === algorithm && createHash(algorithm).update(bytes).digest('base64') === token[2])) throw new Error('Release archive checksum mismatch or unsupported integrity');
}
const packagePath = value => typeof value === 'string' && value && !value.includes('\\') && !value.includes(':') && value.split('/').every(part => part && part !== '.' && part !== '..');

/** Inspect the complete archive; never extract, import an entrypoint or run lifecycle scripts. */
export async function inspectArchive(file, expected) {
  const files = new Map();
  let invalid;
  let manifestBytes;
  await listTar({ file, strict: true, onReadEntry(entry) {
    const path = entry.path.replace(/\/$/, '');
    if (!packagePath(path) || (path !== 'package' && !path.startsWith('package/')) || files.has(path) || !['File', 'OldFile', 'Directory'].includes(entry.type)) invalid ??= entry.path;
    files.set(path, entry.type);
    if (path === 'package/varin.extension.json' && ['File', 'OldFile'].includes(entry.type)) {
      const chunks = [];
      entry.on('data', chunk => chunks.push(chunk));
      entry.on('end', () => { manifestBytes = Buffer.concat(chunks); });
    }
  } });
  if (invalid) throw new Error(`Unsafe release archive entry: ${invalid}`);
  if (!manifestBytes) throw new Error('Missing package/varin.extension.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.id !== expected.extensionId || manifest.version !== expected.version
    || !semver.valid(manifest.version) || !manifest.engines || !semver.validRange(manifest.engines.varin)
    || (expected.engines && manifest.engines.varin !== expected.engines.varin)) throw new Error('Archive manifest identity/version/compatibility disagrees with author release');
  const entrypoints = [];
  if (manifest.entrypoints?.host) {
    if (!['brokered', 'native'].includes(manifest.entrypoints.host.mode)) throw new Error('Invalid Host entrypoint mode');
    entrypoints.push(manifest.entrypoints.host);
  }
  if (manifest.entrypoints?.surfaces !== undefined && !Array.isArray(manifest.entrypoints.surfaces)) throw new Error('Invalid Surface entrypoints');
  for (const entrypoint of manifest.entrypoints?.surfaces ?? []) {
    if (!['declarative', 'managed', 'isolated', 'native'].includes(entrypoint.mode)) throw new Error('Invalid Surface entrypoint mode');
    if (entrypoint.mode !== 'declarative') entrypoints.push(entrypoint);
  }
  for (const entrypoint of entrypoints) {
    if (!packagePath(entrypoint.file) || !/\.(cjs|mjs|js)$/.test(entrypoint.file) || !['File', 'OldFile'].includes(files.get(`package/${entrypoint.file}`))) throw new Error(`Missing prebuilt executable entrypoint: ${entrypoint.file}`);
  }
  return { extensionId: manifest.id, version: manifest.version, files: files.size, entrypoints: entrypoints.length };
}

function releaseManifest(raw, id, version) {
  if (!raw || raw.schemaVersion !== 1 || raw.extensionId !== id || raw.version !== version || !semver.valid(raw.version)
    || !raw.engines || !semver.validRange(raw.engines.varin) || !Array.isArray(raw.assets) || !raw.assets.length) throw new Error('Invalid or mismatched varin.release.json');
  const files = new Set();
  for (const asset of raw.assets) {
    if (!asset || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.file) || files.has(asset.file) || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || typeof asset.platform !== 'string' || !asset.platform || typeof asset.arch !== 'string' || !asset.arch) throw new Error('Invalid release asset target, path or checksum');
    files.add(asset.file);
  }
  return raw;
}

export async function checkEntry(value, request = publicReleaseFetch) {
  const entry = validateEntry(value);
  const downloads = [];
  if (entry.source.kind === 'github-release') {
    const match = /^([\w.-]+)\/([\w.-]+)(?:#(stable|prerelease)(?:\?(.*))?)?$/.exec(entry.source.specifier);
    const query = new URLSearchParams(match[4]);
    const prefix = query.get('tagPrefix') ?? 'v';
    const manifestName = query.get('manifest') ?? 'varin.release.json';
    const releases = [];
    for (let page = 1; ; page++) {
      const batch = await (await request(`https://api.github.com/repos/${match[1]}/${match[2]}/releases?per_page=100&page=${page}`)).json();
      if (!Array.isArray(batch)) throw new Error('Invalid GitHub release list');
      releases.push(...batch);
      if (batch.length < 100) break;
    }
    const release = releases.filter(item => !item.draft && (!item.prerelease || match[3] === 'prerelease') && item.tag_name.startsWith(prefix) && semver.valid(item.tag_name.slice(prefix.length)))
      .sort((a, b) => semver.rcompare(a.tag_name.slice(prefix.length), b.tag_name.slice(prefix.length)))[0];
    if (!release) throw new Error('No published release in the selected series');
    const asset = release.assets.find(item => item.name === manifestName);
    if (!asset) throw new Error(`Newest release is missing ${manifestName}`);
    const manifest = releaseManifest(await (await request(asset.browser_download_url)).json(), entry.id, release.tag_name.slice(prefix.length));
    for (const target of manifest.assets) {
      const asset = release.assets.find(item => item.name === target.file);
      if (!asset) throw new Error(`Release is missing ${target.file}`);
      downloads.push({ url: asset.browser_download_url, integrity: `sha256-${Buffer.from(target.sha256, 'hex').toString('base64')}`, expected: manifest });
    }
  } else {
    const { name, selection } = parseNpmReleaseSource(entry.source.specifier);
    const metadata = await (await request(`https://registry.npmjs.org/${encodeURIComponent(name)}`)).json();
    const range = metadata['dist-tags']?.[selection] ?? selection;
    const version = Object.keys(metadata.versions ?? {}).filter(version => semver.valid(version) && (version === range || semver.satisfies(version, range))).sort(semver.rcompare)[0];
    const dist = metadata.versions?.[version]?.dist;
    if (!version || !dist?.tarball || !dist.integrity) throw new Error('npm source has no published matching package with integrity');
    downloads.push({ url: dist.tarball, integrity: dist.integrity, expected: { extensionId: entry.id, version } });
  }
  const directory = await mkdtemp(join(tmpdir(), 'varin-catalog-release-'));
  const results = [];
  try {
    for (const [index, download] of downloads.entries()) {
      const response = await request(download.url);
      if (!response.body) throw new Error('Release archive response has no body');
      const file = join(directory, `${index}.tgz`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(file, { mode: 0o600 }));
      const tokens = download.integrity.split(/\s+/).map(token => /^(sha512|sha384|sha256)-([A-Za-z0-9+/]+={0,2})$/.exec(token)).filter(Boolean);
      const algorithm = ['sha512', 'sha384', 'sha256'].find(value => tokens.some(token => token[1] === value));
      if (!algorithm) throw new Error('Release archive checksum mismatch or unsupported integrity');
      const hash = createHash(algorithm);
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      const digest = hash.digest('base64');
      if (!tokens.some(token => token[1] === algorithm && token[2] === digest)) throw new Error('Release archive checksum mismatch or unsupported integrity');
      results.push(await inspectArchive(file, download.expected));
    }
    return results;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function changedEntries(base, directory = root) {
  if (!base || /^0+$/.test(base)) return (await readdir(join(directory, 'entries'))).filter(file => file.endsWith('.json')).map(file => `entries/${file}`);
  if (!/^[a-f0-9]{40,64}$/.test(base)) throw new Error('Base must be an exact Git commit SHA');
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', '-z', base, 'HEAD', '--', 'entries/'], { cwd: directory, encoding: 'utf8' });
  return output.split('\0').filter(file => /^entries\/[^/]+\.json$/.test(file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const files = await changedEntries(process.env.CATALOG_BASE_SHA);
    for (const file of files) {
      const results = await checkEntry(JSON.parse(await readFile(join(root, file), 'utf8')));
      console.log(`${file}: verified ${results.length} published archive(s), without executing plugin code`);
    }
    if (!files.length) console.log('No added or changed catalog entries; no author release requests.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
