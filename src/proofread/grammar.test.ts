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

  it('reads curly apostrophes as Harper’s straight ones, and gives the fix back curly', async () => {
    const text = 'The dog wagged it’s tail. She don’t know.';
    const found = await check(text);
    expect(found.map((i) => [text.slice(i.from, i.to), i.suggestions[0]])).toEqual([
      ['it’s', 'its'],
      ['don’t', 'doesn’t'],
    ]);
    // With straight quotes, the fix stays straight.
    expect((await check("She don't know."))[0]!.suggestions[0]).toBe("doesn't");
  });

  it('leaves good fiction alone', async () => {
    for (const text of [
      'He strode across the room, and she hid the key.',
      'She leapt out of the boat. He woke up again. She burst into tears.',
      'He spun around, swore under his breath and dealt the cards.',
      'With a sharp gesture he motioned them to silence.',
      'She let out a long breath.',
      'She sort of smiled at him.',
      'The poor boy cried, and Dick laughed.',
      'You fellows are late.',
      'We left, for they were coming.',
      'Nothing prevented their being seen, and the idea of its being offered was absurd.',
      'Whom did you invite? One of whom was old.',
      'He thought over all the things she said.',
      'I am afraid of him. It was clear that he lied.',
      'He was too frank to be understood.',
      'Thus it was that he came home.',
      'Their two friends took their earlier walk.',
      'She drew back in a hurry.',
      '‘It’s no use speaking to it,’ she said.',
    ]) {
      expect(await check(text), text).toEqual([]);
    }
  });

  it('still catches the slips those rules are for', async () => {
    const said = async (text: string) => (await check(text)).map((i) => text.slice(i.from, i.to));
    expect(await said('She go to the store.')).toEqual(['go']);
    expect(await said('Whom is at the door?')).toEqual(['Whom']);
    expect(await said('It is to late.')).toEqual(['to']);
    expect(await said('Its a lovely day.')).toEqual(['Its']);
  });

  it('puts Harper’s code quotes into curly ones', () => {
    expect(quoteTicks('Use `have` rather than `of`.')).toBe('Use “have” rather than “of”.');
  });
});
