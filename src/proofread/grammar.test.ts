import { beforeAll, describe, expect, it } from 'vitest';
import { LocalLinter } from 'harper.js';
import { slimBinary } from 'harper.js/slimBinary';
import { grammarIssues, quoteTicks, setUpLinter } from './grammar';

const linter = new LocalLinter({ binary: slimBinary });
let why: Record<string, string>;
beforeAll(async () => {
  await setUpLinter(linter, 'en-US', ['Earlene']);
  why = await linter.getLintDescriptions();
}, 30_000);

const check = async (text: string) => (await grammarIssues(linter, [text], [[]], why))[0]!;

describe('grammar', () => {
  it('finds agreement, articles, repeated words and punctuation', async () => {
    const found = await check('She go to the store and buy a apple. It was was a long day , he said.');
    const said = found.map((i) => [found && i.kind, i.suggestions[0]]);
    expect(said).toContainEqual(['grammar', 'goes']);
    expect(said).toContainEqual(['grammar', 'an']);
    expect(said).toContainEqual(['grammar', 'was']);
    expect(found.find((i) => i.rule.length > 0 && i.suggestions[0] === '')).toBeTruthy();
    expect(found.every((i) => i.why && !i.message.includes('`'))).toBe(true);
  });

  it('leaves "had had" and "that that" alone, and calls "more happier" a mistake', async () => {
    expect(await check('He had had enough, and he knew that that was the end of it.')).toEqual([]);
    const found = await check('He was more happier than before.');
    expect(found.map((i) => [i.kind, i.suggestions[0]])).toEqual([['grammar', 'happier']]);
  });

  it('leaves names alone rather than turning them into acronyms', async () => {
    expect(await check('I told Sam to go home.')).toEqual([]);
  });

  it('leaves spelling to Hunspell and skips issues that overlap a misspelling', async () => {
    expect(await check('Earleen recieved irregardless the grits.')).toEqual([]);
    const text = 'He could of left.';
    const all = await check(text);
    expect(all.map((i) => text.slice(i.from, i.to))).toEqual(['could of']);
    const [kept] = await grammarIssues(linter, [text], [[{ from: 9, to: 11, kind: 'spelling', rule: 'spelling', message: '', suggestions: [] }]], why);
    expect(kept).toEqual([]);
  });

  it('counts positions the way JavaScript does, past emoji', async () => {
    const text = 'She smiled 😀 and he could of left.';
    const [issue] = await check(text);
    expect(text.slice(issue!.from, issue!.to)).toBe('could of');
  });

  it('puts Harper’s code quotes into curly ones', () => {
    expect(quoteTicks('Use `have` rather than `of`.')).toBe('Use “have” rather than “of”.');
  });
});
