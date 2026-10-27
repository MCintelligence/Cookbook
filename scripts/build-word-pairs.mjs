// Counts which words follow which in fiction, for Salty Sam's suggestions
// (see src/proofread/context.ts). Makes public/dictionaries/word-pairs.txt.
//
//   node scripts/build-word-pairs.mjs [cache folder]
//
// The counts are Google Books Ngram Viewer's English Fiction 2-grams (2012),
// matches since 1900, under CC BY 3.0: https://books.google.com/ngrams/info
// It reads about 22 GB, a file at a time, four at once; each file's counts
// are kept in the cache folder, so a stopped run carries on where it left off.
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { join } from 'node:path';

const SOURCE = 'http://storage.googleapis.com/books/ngrams/books/googlebooks-eng-fiction-all-2gram-20120701-';
const SINCE = 1900;
/** A spelling of a pair (case counts) seen fewer times than this is left out before cases are merged. */
const MIN_SPELLING = 20;
/** Pairs kept in the cache. */
const MIN_CACHED = 100;
/** How many words and pairs ship: enough to know the common ones, small enough to load in a moment. */
const WORDS = 50_000;
const PAIRS = 250_000;
/** Counts are kept in thousands, which is plenty and keeps the file small. */
const SCALE = 1_000;
/** Below these, a word or pair could never make the cut, so it isn't held while sorting. */
const MIN_WORD = 1_000;
const MIN_PAIR = 1_000;
const OUT = 'public/dictionaries/word-pairs.txt';

const cache = process.argv[2] ?? 'node_modules/.cache/word-pairs';
mkdirSync(cache, { recursive: true });

const letters = 'abcdefghijklmnopqrstuvwxyz';
const prefixes = [...[...letters].flatMap((a) => [...letters, '_'].map((b) => a + b)), 'other', 'punctuation'];
const plain = (w) => /^\p{L}[\p{L}'-]*$/u.test(w);

/** One file's counts: each lowercased first word's total, then the pairs. Null when Google has no such file. */
async function count(prefix) {
  const out = join(cache, `${prefix}.tsv`);
  if (existsSync(out)) return out;
  const res = await fetch(SOURCE + prefix + '.gz');
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`${prefix}: ${res.status}`);
  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  const firsts = new Map();
  const pairs = new Map();
  let cur = '';
  let sum = 0;
  const flush = () => {
    if (sum === 0) return;
    const sp = cur.indexOf(' ');
    if (sp <= 0) return;
    const a = cur.slice(0, sp);
    const b = cur.slice(sp + 1);
    if (!plain(a) || !plain(b)) return;
    const la = a.toLowerCase();
    firsts.set(la, (firsts.get(la) ?? 0) + sum);
    if (sum < MIN_SPELLING) return;
    const key = `${la} ${b.toLowerCase()}`;
    pairs.set(key, (pairs.get(key) ?? 0) + sum);
  };
  // Lines are "first second\tyear\tmatches\tvolumes", sorted, so each pair's years come together.
  for await (const line of lines) {
    const [ngram, year, matches] = line.split('\t');
    if (ngram !== cur) {
      flush();
      cur = ngram;
      sum = 0;
    }
    if (Number(year) >= SINCE) sum += Number(matches);
  }
  flush();
  const file = createWriteStream(out + '.part');
  for (const [w, n] of firsts) file.write(`${w}\t${n}\n`);
  for (const [p, n] of pairs) if (n >= MIN_CACHED) file.write(`${p}\t${n}\n`);
  await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())));
  renameSync(out + '.part', out);
  return out;
}

const done = [];
const queue = [...prefixes];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let p = queue.shift(); p !== undefined; p = queue.shift()) {
      const out = await count(p);
      if (out) done.push(out);
      console.log(`${prefixes.length - queue.length}/${prefixes.length} ${p}`);
    }
  }),
);

// A first word's counts and pairs are all in the file for its first letters, so files need no merging.
// Only words and pairs common enough to be kept are held, so the whole of English fits in memory.
const words = [];
const pairs = [];
let total = 0;
for (const f of done.sort()) {
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab);
    const n = Number(line.slice(tab + 1));
    if (key.includes(' ')) {
      if (n >= MIN_PAIR) pairs.push([key, n]);
    } else {
      total += n;
      if (n >= MIN_WORD) words.push([key, n]);
    }
  }
}

const top = (list, n) => list.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
const keptWords = top(words, WORDS);
const known = new Set(keptWords.map(([w]) => w));
const keptPairs = top(
  pairs.filter(([p]) => p.split(' ').every((w) => known.has(w))),
  PAIRS,
);
const shown = keptWords.reduce((a, [, n]) => a + n, 0);

const scaled = (n) => Math.max(1, Math.round(n / SCALE));
const byFirst = new Map();
for (const [p, n] of keptPairs) {
  const [a, b] = p.split(' ');
  byFirst.set(a, [...(byFirst.get(a) ?? []), `${b} ${scaled(n)}`]);
}
const lines = [
  "# Word and word-pair counts for Cookbook's spelling suggestions, made by scripts/build-word-pairs.mjs.",
  `# From Google Books Ngram Viewer's English Fiction 2-grams (2012), matches since ${SINCE}, CC BY 3.0:`,
  '# https://books.google.com/ngrams/info',
  `# In thousands. "word count" lines are words; "first<tab>second count second count…" lines are the words after one.`,
  ...keptWords.map(([w, n]) => `${w} ${scaled(n)}`),
  // The rest of the words, so the total stays whole and rare words aren't made likelier than they are.
  `<other> ${scaled(total - shown)}`,
  ...[...byFirst].map(([a, next]) => `${a}\t${next.join(' ')}`),
];
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`${done.length} files, ${total} words: kept ${keptWords.length} words and ${keptPairs.length} pairs in ${OUT}.`);
