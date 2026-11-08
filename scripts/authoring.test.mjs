import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLI_TEMPLATES, scaffoldCommands, quoteShell, toListingDraft, jsonLines } from '../site/authoring.js';
import { projectFloor, tilePulse, buildTiles, CELL, TILT } from '../site/scene.js';
import { EXAMPLE_LISTING, inspectDraft } from '../site/marketplace.js';
import { validateEntry } from './catalog.mjs';

test('scaffold generator uses only actual CLI template names and all required arguments', () => {
  assert.deepEqual(CLI_TEMPLATES, ['surface','shell','editor','view','language','debug','test']);
  for (const template of CLI_TEMPLATES) {
    const result = scaffoldCommands({ id: 'dev.example.panel', name: 'My panel', template });
    assert.equal(result.error, undefined); assert.match(result.command, /^varin-extension init \.\/my-extension --id 'dev\.example\.panel' --name='My panel' --template /);
    assert.match(result.command, new RegExp(`--template ${template} &&\\n`)); assert.match(result.command, /varin-extension build &&\nvarin-extension check &&\nvarin-extension test$/);
  }
});
test('command generator rejects invalid inputs and shell-quotes names without execution', () => {
  for (const patch of [{ id: 'bad; curl host' }, { id: '' }, { id: 'UPPER_CASE' }, { id: 'a'.repeat(161) }, { name: '' }, { name: 'one\ntwo' }, { name: 'one\u0000two' }, { template: 'policy' }, { template: 'tool' }]) assert.ok(scaffoldCommands({ id: 'dev.example.panel', name: 'Panel', template: 'surface', ...patch }).error);
  assert.equal(quoteShell("don't $(execute)"), "'don'\\''t $(execute)'");
  const command=scaffoldCommands({ id: 'dev.example.panel',name:'Panel; $(touch /tmp/untrusted)',template:'surface' }).command;
  assert.ok(command.includes("--name='Panel; $(touch /tmp/untrusted)'"));
  assert.ok(scaffoldCommands({id:'dev.example.panel',name:'--demo',template:'surface'}).command.includes("--name='--demo'"));
  assert.ok(command.split('\n').slice(0,-1).every(line => line.endsWith(' &&')), 'stop the command chain when any step fails');
});
test('inspect-in-validator converts only the built catalog icon prefix', () => {
  const catalog = validateEntry(EXAMPLE_LISTING), draft = toListingDraft(catalog);
  assert.equal(catalog.icon, '../assets/dev.example.weather.svg'); assert.equal(draft.icon, 'assets/dev.example.weather.svg');
  assert.deepEqual(inspectDraft(JSON.stringify(draft)).errors, []); assert.deepEqual(draft.source, catalog.source);
});
test('code inspector preserves exact JSON and marks source, identity and resource groups', () => {
  const listing = { ...validateEntry(EXAMPLE_LISTING), description: '<img src=x> "quoted"\ntext' };
  const lines=jsonLines(listing);
  assert.deepEqual(JSON.parse(lines.map(line=>line.tokens.map(token=>token.text).join('')).join('\n')),listing);
  assert.ok(lines.some(line=>line.group==='source'&&line.text.includes('github-release')));
  assert.ok(lines.some(line=>line.group==='identity'&&line.text.includes('dev.example.weather')));
  assert.ok(lines.some(line=>line.group==='links'&&line.text.includes('../assets/')));
  assert.equal(lines[0].group,''); assert.equal(lines.at(-1).group,'');
});
test('scene geometry matches the reference camera and deterministic breathing field', () => {
  assert.equal(CELL,96);assert.equal(TILT,58);assert.deepEqual(projectFloor(0,0),{x:0,y:0});
  assert.equal(projectFloor(100000,100000),null);
  const p=projectFloor(48,48);assert.equal(p.x,0);assert.ok(p.y>35&&p.y<40);
  assert.deepEqual(buildTiles(),buildTiles());assert.equal(buildTiles().length,841);
  for (const tile of buildTiles()) {assert.ok(tile.opacity>=.55&&tile.opacity<=1);assert.ok(tile.delay>=0&&tile.delay<2200);}
  assert.equal(tilePulse(1,2,3),tilePulse(1,2,3));
});
test('static page uses the reference structure without network fonts, inline code or fake production listings', async () => {
  const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
  assert.ok(html.includes('class="v-nav"'));assert.ok(html.includes('class="market-hero"'));assert.ok(html.includes('class="market-grid"'));assert.ok(html.includes('class="anatomy"'));
  assert.equal((html.match(/class="card why"/g)||[]).length,6);
  assert.equal((html.match(/class="face /g)||[]).length,3);
  assert.equal((html.match(/<i><\/i>/g)||[]).length>=32,true);
  assert.doesNotMatch(html, /style=|<script(?![^>]*\bsrc=)[^>]*>|fonts\.google|INITIAL_EXTENSIONS/);
  const css=await readFile(new URL('../site/style.css',import.meta.url),'utf8');
  assert.match(css,/--page: 1200px/);assert.match(css,/--radius-card: 20px/);assert.match(css,/perspective\(1800px\)/);assert.doesNotMatch(css,/@import|url\(["']?https?:|data:image/);
  const headers=await readFile(new URL('../site/_headers',import.meta.url),'utf8');assert.doesNotMatch(headers,/unsafe-inline|unsafe-eval/);
});
test('all literal app ID selectors exist exactly once in the static document', async () => {
  const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8');
  const app=await readFile(new URL('../site/app.js',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
  for(const match of app.matchAll(/\$\(['"]#([a-zA-Z][\w-]*)['"]\)/g))assert.ok(ids.includes(match[1]),`Missing HTML id ${match[1]}`);
});

// Contrast is intentionally the one token-level departure from the mockup.
test('secondary small text meets AA on each light surface while decorative sage is retained', async () => {
  const css=await readFile(new URL('../site/style.css',import.meta.url),'utf8');
  assert.match(css,/--sage: light-dark\(#77837f, #8e9694\)/);
  const text=css.match(/--sage-text: light-dark\(#([0-9a-f]{6}), #([0-9a-f]{6})\)/);assert.ok(text);
  const luminance=hex=>hex.match(/../g).map(channel=>parseInt(channel,16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  for(const bg of ['fcfbf9','fffefd','efefe8','f0efed']) assert.ok(contrast(text[1],bg)>=4.5,`${text[1]} on ${bg}`);
  for(const bg of ['161616','1c1c1c','1e1e1d','262626']) assert.ok(contrast(text[2],bg)>=4.5,`${text[2]} on ${bg}`);
});
