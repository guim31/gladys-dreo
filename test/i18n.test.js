// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, and the documentation, whose four versions keep the same sections.
// German says "du", never the polite "Sie"; Spanish says "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INIT_FAILED, refreshReport } from '../src/app.js';
import { LANGUAGES } from '../src/config.js';
import { MESSAGES, MODE_LABELS, NAMES, WORDS } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max, render = (value) => value) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(render(value), `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(
    manifest.config_schema.find((f) => f.key === 'language').options.map((o) => o.value),
    LANGS,
  );
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 40, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the catalog description holds 10 characters at least in every language', () => {
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('every message of the code has the four languages', () => {
  const found = [
    ...problems(INIT_FAILED, 'INIT_FAILED', MAX.message),
    ...Object.entries(MESSAGES).flatMap(([key, value]) =>
      problems(value, `MESSAGES.${key}`, MAX.message),
    ),
  ];
  assert.deepEqual(found, []);
});

test('the feature names, mode labels and words exist in every language', () => {
  const render = (value) => (typeof value === 'function' ? value(12) : value);
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  assert.deepEqual(tableProblems(MODE_LABELS, 'MODE_LABELS', MAX.short), []);
  assert.deepEqual(tableProblems(WORDS, 'WORDS', MAX.message, render), []);
});

test('the refresh report exists in every language', () => {
  const hub = {
    config: { email: 'a@example.com', password: 'x' },
    authRefused: false,
    devices: new Map([['A', { name: 'Fan', model: 'DR-HTF017S', connected: false }]]),
    unsupported: [{ name: 'AC', model: 'DR-HAC005S' }],
  };
  const report = refreshReport(hub);
  assert.deepEqual(problems(report, 'refreshReport', 400), []);
  assert.match(
    report.de,
    /2 Dreo-Gerät\(e\):\n• Fan \(DR-HTF017S\), offline\n• AC \(DR-HAC005S\), noch nicht/,
  );
  assert.equal(refreshReport({ ...hub, authRefused: true }), MESSAGES.authRefused);
});

test('Spanish addresses the user as "usted", never "tú"', () => {
  const spanish = [
    ...manifestTexts(manifest).map(({ value }) => value.es),
    ...Object.values(MESSAGES).map((value) => value.es),
  ].join(' ');
  assert.doesNotMatch(spanish, /(?<!\p{L})(tú|tu|tus|te|introduce|elige|comprueba)(?!\p{L})/iu);
});

// The four documentations: same sections, in the same order.
const DOCS = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);
const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line));

test('the four documentations have the same sections', () => {
  const shape = (text) => headings(text).map((line) => line.match(/^#+/)[0]);
  for (const lang of LANGS) {
    assert.ok(DOCS[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(
      shape(DOCS[lang]),
      shape(DOCS.en),
      `docs/${lang}.md sections differ from docs/en.md`,
    );
  }
  assert.ok(headings(DOCS.en).length >= 8);
});

test('the documentations say the integration was developed without the hardware', () => {
  for (const lang of LANGS) {
    assert.match(DOCS[lang], /Dreo/);
  }
  assert.match(DOCS.en, /without the hardware/i);
  assert.match(DOCS.fr, /sans le matériel/i);
  assert.match(DOCS.de, /ohne die Hardware/i);
  assert.match(DOCS.es, /sin el hardware/i);
});

test('the German documentation and texts never use the polite form', () => {
  const found = DOCS.de
    .split('\n')
    .filter((line) => POLITE_GERMAN.test(line))
    .map((line) => `docs/de.md: ${line}`);
  assert.deepEqual(found, []);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: 'Licht' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Light', fr: 'Éclairage', de: '', es: 'Luz' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of [
    'Wählen Sie',
    'Ihr Gerät',
    'Ihre IP',
    'mit Ihrem',
    'Ihren',
    'Ihrer',
    'Ihres',
  ]) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(problems({ en: 'a', fr: 'a', de: 'Prüfe sie, ihre', es: 'a' }, 'x', 60), []);
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
