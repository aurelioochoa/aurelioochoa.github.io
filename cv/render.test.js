import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './render.js';

test('interpolates dotted paths and escapes HTML', () => {
  assert.equal(render('<p>{{a.b}}</p>', { a: { b: '<x> & y' } }), '<p>&lt;x&gt; &amp; y</p>');
});

test('throws on missing key', () => {
  assert.throws(() => render('{{nope}}', {}), /Missing key "nope"/);
});

test('renders each blocks with this context, including nested', () => {
  const tpl = '{{#each jobs}}<h3>{{this.role}}</h3>{{#each this.bullets}}<li>{{this}}</li>{{/each}}{{/each}}';
  const data = { jobs: [{ role: 'Dev', bullets: ['a', 'b'] }, { role: 'Ops', bullets: [] }] };
  assert.equal(render(tpl, data), '<h3>Dev</h3><li>a</li><li>b</li><h3>Ops</h3>');
});

test('if blocks include or omit content', () => {
  assert.equal(render('{{#if photo}}<img>{{/if}}ok', { photo: false }), 'ok');
  assert.equal(render('{{#if photo}}<img>{{/if}}ok', { photo: true }), '<img>ok');
});

test('throws on unclosed block', () => {
  assert.throws(() => render('{{#each xs}}<li>', { xs: [] }), /Unclosed/);
});

test('throws on mismatched closing tags', () => {
  assert.throws(() => render('{{#each a}}{{#if b}}z{{/each}}{{/if}}', { a: [1], b: true }), /Mismatched/);
});

test('escapes quotes in HTML attributes', () => {
  assert.equal(render('{{x}}', { x: '"quoted" & \'single\'' }), '&quot;quoted&quot; &amp; &#39;single&#39;');
});
