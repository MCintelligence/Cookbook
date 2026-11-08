import { describe, expect, it } from 'vitest';
import { parsedIssues } from './parse';
import { combine } from './pete';

const said = (text: string) => parsedIssues(text).map((i) => [i.rule, text.slice(i.from, i.to), ...i.suggestions]);

describe('Pete’s sentence reader', () => {
  it('finds fragments, but not the ones novelists write on purpose', () => {
    expect(said('Because the oven was cold.')).toEqual([['fragment', 'Because the oven was cold.']]);
    expect(said('Although she had baked all morning.')).toEqual([['fragment', 'Although she had baked all morning.']]);
    for (const fine of ['She glanced at the clock. Half past nine.', 'If only.', 'Although it rained, they went out.', 'While they were speaking the Professor had leant forward.', '“Because I said so.”']) expect(said(fine)).toEqual([]);
  });

  it('finds openers that dangle, but not ones a person or animal can do', () => {
    expect(said('Running down the stairs, the bread fell out of her hands.')).toEqual([['dangling', 'Running down the stairs']]);
    expect(said('Walking into the kitchen, the smell of bread was wonderful.')).toEqual([['dangling', 'Walking into the kitchen']]);
    expect(said('Having finished the soup, the bowls were washed.')).toEqual([['dangling', 'Having finished the soup']]);
    for (const fine of ['Walking home, she counted the stars.', 'Running down the stairs, Mama Lou dropped the bread.', 'Opening the door, the old man stepped inside.', 'Reaching up, her hand found the shelf.']) expect(said(fine)).toEqual([]);
  });

  it('finds a slip from past to present inside a sentence', () => {
    expect(said('He went to the store and buys milk.')).toEqual([['tense-shift', 'buys', 'bought']]);
    expect(said('They argued all night and then goes to bed.')).toEqual([['tense-shift', 'goes', 'went']]);
    expect(said('She opened the oven and takes out the tray.')).toEqual([['tense-shift', 'takes', 'took']]);
    for (const fine of ['She opened the oven and took out the tray.', 'He says that she went home and sleeps all day.', 'His eyes and mouths so wide.', '“I went out and he buys it,” she said.']) expect(said(fine)).toEqual([]);
  });

  it('finds missing capitals, but not after abbreviations, speech or an ellipsis', () => {
    expect(said('On monday they spoke english.')).toEqual([
      ['capitals', 'monday', 'Monday'],
      ['capitals', 'english', 'English'],
    ]);
    expect(said('what a day it had been. and then it rained.')).toEqual([
      ['capitals', 'what', 'What'],
      ['capitals', 'and', 'And'],
    ]);
    for (const fine of ['“Hi!” she said.', 'Mr. Brown arrived. e.g. this.', 'She went home…and slept.', 'Oh! not again.', 'iPhones were everywhere.', 'She may come in May.']) expect(said(fine)).toEqual([]);
  });

  it('sorts out mix-ups from the words around them', () => {
    expect(said('Who’s coat is this?')).toEqual([['word-mixup', 'Who’s', 'Whose']]);
    expect(said('She took a peak through the curtain.')).toEqual([['word-mixup', 'peak', 'peek']]);
    expect(said('She complemented him on his cooking.')).toEqual([['word-mixup', 'complemented', 'complimented']]);
    expect(said('I accept everyone accept him.')).toEqual([['word-mixup', 'accept', 'except']]);
    expect(said('The principle of the school was strict.')).toEqual([['word-mixup', 'principle', 'principal']]);
    expect(said('Irregardless, it was alright.')).toEqual([
      ['usage', 'Irregardless', 'Regardless'],
      ['usage', 'alright', 'all right'],
    ]);
    for (const fine of ['Who’s there?', 'Who’s coming to dinner?', 'They reached the peak at noon.', 'Prices peaked at 40 pence.', 'The colours complement each other.', 'It was a matter of principle.', '“It’s alright,” he said.']) expect(said(fine)).toEqual([]);
  });

  it('knows the pasts that get made regular', () => {
    expect(said('They brung the pie and she throwed the scraps.')).toEqual([
      ['verb-form', 'brung', 'brought'],
      ['verb-form', 'throwed', 'threw'],
    ]);
    expect(said('The seed sprouted.')).toEqual([]);
  });

  it('lets Pete’s fix replace Sam’s mark on the same word', () => {
    const sam = { from: 0, to: 12, kind: 'spelling' as const, rule: 'spelling', message: '', suggestions: [] };
    const pete = parsedIssues('Irregardless, the soup was cold.');
    expect(combine([sam], [], pete, [], () => false).map((i) => i.rule)).toEqual(['usage']);
  });
});
