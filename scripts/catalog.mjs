import semver from 'semver';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, cp, stat, realpath } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty`);
  return value.trim();
};
function https(value, label) {
  const result = new URL(text(value, label));
  if (result.protocol !== 'https:' || result.username || result.password) throw new Error(`${label} must be a public HTTPS URL without credentials`);
  return result.href;
}
// Keep this public source grammar aligned with @varin/extension-contract releases.ts.
export function parseNpmReleaseSource(specifier) {
  const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@([\s\S]+))?$/.exec(specifier.trim());
  if (!match) throw new Error('npm release source requires a registry package name and optional version, range or dist-tag');
  const selection = match[2]?.trim() ?? 'latest';
  if (!selection || (!semver.validRange(selection) && encodeURIComponent(selection) !== selection)) throw new Error('npm release selection must be a valid SemVer range or dist-tag');
  return { name: match[1], selection };
}
export function validateEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Entry must be an object');
  const allowed = new Set(['id', 'displayName', 'description', 'author', 'categories', 'keywords', 'icon', 'repository', 'homepage', 'source']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Unsupported listing field: ${key}; versions belong to the author release source`);
  const id = text(value.id, 'id');
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id)) throw new Error('Invalid extension id');
  const source = value.source;
  if (!source || !['github-release', 'npm'].includes(source.kind)) throw new Error('Public entries require a GitHub release or npm registry source');
  if (Object.keys(source).some(key => !['kind', 'specifier', 'display'].includes(key))) throw new Error('Unsupported source field');
  const specifier = text(source.specifier, 'source.specifier');
  if (source.kind === 'github-release') {
    const match = /^([\w.-]+)\/([\w.-]+)(?:#(stable|prerelease)(?:\?(.*))?)?$/.exec(specifier);
    if (!match || match[1] === '.' || match[1] === '..' || match[2] === '.' || match[2] === '..') throw new Error('GitHub source must identify owner/repository and an optional release series');
    const query = new URLSearchParams(match[4]);
    for (const key of query.keys()) if (!['tagPrefix', 'manifest'].includes(key)) throw new Error(`Unsupported release selector ${key}`);
    if (query.has('manifest') && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(query.get('manifest'))) throw new Error('Invalid release manifest filename');
  } else parseNpmReleaseSource(specifier);
  const icon = text(value.icon, 'icon');
  if (!/^assets\/[a-zA-Z0-9._/-]+\.(svg|png|webp|jpg|jpeg)$/.test(icon) || icon.split('/').some(part => part === '..' || part === '.')) throw new Error('Icon must be a repository assets/ image');
  const strings = (values, label) => {
    if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
    const result = values.map(item => text(item, label));
    if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicates`);
    return result;
  };
  return { id, displayName: text(value.displayName, 'displayName'), description: text(value.description, 'description'),
    author: text(value.author, 'author'), categories: strings(value.categories, 'categories'), keywords: strings(value.keywords ?? [], 'keywords'),
    icon: `../${icon}`, repository: https(value.repository, 'repository'),
    ...(value.homepage ? { homepage: https(value.homepage, 'homepage') } : {}),
    source: { kind: source.kind, specifier, display: text(source.display, 'source.display') } };
}

export async function buildCatalog(directory = root) {
  const files = (await readdir(join(directory, 'entries'))).filter(file => file.endsWith('.json')).sort();
  const entries = [];
  const ids = new Set();
  const hash = createHash('sha256');
  for (const file of files) {
    const entry = validateEntry(JSON.parse(await readFile(join(directory, 'entries', file), 'utf8')));
    if (file !== `${entry.id}.json`) throw new Error(`Entry filename must match its id: ${file}`);
    if (ids.has(entry.id)) throw new Error(`Duplicate extension id: ${entry.id}`);
    ids.add(entry.id);
    const icon = await realpath(resolve(directory, entry.icon.slice(3)));
    const assetPath = relative(await realpath(join(directory, 'assets')), icon);
    if (!assetPath || assetPath.startsWith('..') || assetPath.startsWith('/')) throw new Error(`Icon for ${entry.id} escapes assets/`);
    const info = await stat(icon);
    if (!info.isFile()) throw new Error(`Missing icon for ${entry.id}`);
    const bytes = await readFile(icon);
    if (icon.endsWith('.svg') && /<\s*(script|foreignObject)|\bon\w+\s*=|<!ENTITY|<!DOCTYPE|(?:href|src)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(bytes.toString('utf8'))) throw new Error(`Icon for ${entry.id} contains active or external content`);
    hash.update(entry.id).update(bytes);
    entries.push(entry);
  }
  hash.update(JSON.stringify(entries));
  return { schemaVersion: 1, contentVersion: hash.digest('hex'), entries };
}

export async function build(directory = root) {
  const catalog = await buildCatalog(directory);
  const json = `${JSON.stringify(catalog, null, 2)}\n`;
  await mkdir(join(directory, 'catalog'), { recursive: true });
  await writeFile(join(directory, 'catalog', 'v1.json'), json);
  const dist = join(directory, 'dist');
  await mkdir(dist, { recursive: true });
  await cp(join(directory, 'site'), dist, { recursive: true });
  await cp(join(directory, 'assets'), join(dist, 'assets'), { recursive: true });
  await mkdir(join(dist, 'catalog'), { recursive: true });
  await writeFile(join(dist, 'catalog', 'v1.json'), json);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] ?? 'validate';
    if (!['validate', 'build'].includes(command)) throw new Error('Usage: node scripts/catalog.mjs validate|build');
    const catalog = command === 'build' ? await build() : await buildCatalog();
    console.log(`${command}: ${catalog.entries.length} entries; content ${catalog.contentVersion}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
