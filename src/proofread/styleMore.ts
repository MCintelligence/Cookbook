import { type Issue, words } from './check';

/**
 * More of Spicy Sally's style notes, for the kinds Word's style checker
 * offers that she didn't yet: split infinitives with more than one word in
 * the split, long strings of prepositional phrases, piled-up ! and ?, and
 * (switched off at first, since fiction uses them freely) gendered job
 * words and sentences that open with "And" or "But". The rules and word
 * lists are Cookbook's own.
 */

export const MORE_STYLE_RULES: { id: string; label: string; why: string }[] = [
  {
    id: 'split-infinitive',
    label: 'Split infinitives (to really quickly go)',
    why: 'One word between “to” and its verb is fine. Two or more and the reader waits too long for the verb.',
  },
  {
    id: 'preposition-chain',
    label: 'Strings of prepositions (on the table in the kitchen of the house by…)',
    why: 'Four or more prepositional phrases in a row make the reader hold every one in mind. Break the string or cut some.',
  },
  {
    id: 'loud-punctuation',
    label: 'Piled-up ! and ?',
    why: 'One mark carries the feeling. “?!” is the most a sentence needs.',
  },
  {
    id: 'gendered-word',
    label: 'Gendered job words (chairman, fireman), off at first',
    why: 'Words like “fireman” assume who does the job. A neutral word fits whoever it is. Off at first, since a story may want the word.',
  },
  {
    id: 'conjunction-start',
    label: 'Sentences that open with And or But, off at first',
    why: 'Formal writing avoids opening with “And” or “But”. Fiction does it all the time, so this starts off.',
  },
];

/** Style checks here that start switched off. */
export const MORE_OPT_IN = ['gendered-word', 'conjunction-start'];

const WHY = Object.fromEntries(MORE_STYLE_RULES.map((r) => [r.id, r.why]));
const issue = (from: number, to: number, rule: string, message: string, suggestions: string[] = []): Issue => ({
  from,
  to,
  kind: 'style',
  rule,
  message,
  suggestions,
  why: WHY[rule],
});
const matchCase = (original: string, replacement: string) => (/^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);

// ---------- Split infinitives ----------

const SPLITTERS =
  'really|just|even|never|always|also|not|ever|quite|almost|completely|actually|simply|truly|finally|suddenly|slowly|quickly|carefully|gently|quietly|properly|fully|further|better|somehow';
const SPLIT = new RegExp(`\\bto\\s+((?:(?:\\p{L}+ly|${SPLITTERS})\\s+){2,})(\\p{L}+)\\b`, 'giu');

// ---------- Prepositions ----------

const PREPOSITIONS = new Set(
  'of in on at by from with into onto upon under over behind beside near across through toward towards among between beneath above below along around inside outside within without past'.split(' '),
);
/** Words a prepositional phrase can't run through: a verb, a joining word, a pronoun subject. */
const PHRASE_STOP = /^(?:and|or|but|nor|that|which|who|whom|when|where|while|was|were|is|are|had|has|have|be|been|did|does|do|could|would|should|will|can|might|must|i|he|she|they|we|you)$/;
/** Four or more phrases in a row. */
const CHAIN = 4;
/** At most this many words between one preposition and the next. */
const PHRASE_WORDS = 4;

function prepositionChains(text: string, out: Issue[]) {
  const ws = words(text);
  let start = -1;
  let count = 0;
  let last = -1;
  const close = (end: number) => {
    if (count >= CHAIN) {
      const lastWord = ws[Math.min(end, ws.length - 1)]!;
      out.push(issue(ws[start]!.from, lastWord.to, 'preposition-chain', `${count} prepositional phrases in a row. Break the string, or cut some.`));
    }
    start = -1;
    count = 0;
  };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    const lower = w.word.toLowerCase();
    const gap = i > 0 ? text.slice(ws[i - 1]!.to, w.from) : '';
    if (start >= 0 && (/[.!?;:,()—–"“”]/u.test(gap) || PHRASE_STOP.test(lower) || i - last > PHRASE_WORDS)) close(i - 1 > last ? i - 1 : last + 1);
    if (PREPOSITIONS.has(lower)) {
      if (start < 0) start = i;
      count++;
      last = i;
    }
  }
  if (start >= 0) close(ws.length - 1);
}

// ---------- Loud punctuation ----------

const LOUD = /(?:[!?]{3,}|!!|\?\?|\?!\?|!\?!)/gu;

// ---------- Gendered words ----------

const GENDERED: Record<string, string> = {
  chairman: 'chair',
  chairwoman: 'chair',
  chairmen: 'chairs',
  fireman: 'firefighter',
  firemen: 'firefighters',
  policeman: 'police officer',
  policewoman: 'police officer',
  policemen: 'police officers',
  mailman: 'mail carrier',
  mailmen: 'mail carriers',
  postman: 'postal worker',
  stewardess: 'flight attendant',
  stewardesses: 'flight attendants',
  mankind: 'humankind',
  manpower: 'workforce',
  salesman: 'salesperson',
  saleswoman: 'salesperson',
  salesmen: 'salespeople',
  businessman: 'businessperson',
  businesswoman: 'businessperson',
  businessmen: 'businesspeople',
  congressman: 'member of Congress',
  congresswoman: 'member of Congress',
  councilman: 'council member',
  councilwoman: 'council member',
  spokesman: 'spokesperson',
  spokeswoman: 'spokesperson',
  workman: 'worker',
  workmen: 'workers',
  cameraman: 'camera operator',
  cameramen: 'camera operators',
  foreman: 'supervisor',
  waitress: 'server',
  waitresses: 'servers',
  headmaster: 'head teacher',
  headmistress: 'head teacher',
  weatherman: 'meteorologist',
  anchorman: 'anchor',
  repairman: 'repairer',
  middleman: 'go-between',
  fisherman: 'fisher',
  fishermen: 'fishers',
  'man-made': 'artificial',
};
const GENDERED_RE = new RegExp(`\\b(?:${Object.keys(GENDERED).join('|')})\\b`, 'giu');

// ---------- And, But ----------

const OPENING = /(?:^|(?<=[.!?…]["”’]?\s+))(And|But|Hopefully)\b(?!,)/gu;

/** Sally's extra notes on one paragraph. `inSpeech` says whether a position is inside dialogue, which is left alone. */
export function moreStyleIssues(text: string, inSpeech: (at: number) => boolean): Issue[] {
  const out: Issue[] = [];
  for (const m of text.matchAll(SPLIT)) {
    if (inSpeech(m.index)) continue;
    const between = m[1]!.trim();
    const verb = m[2]!;
    if (/ly$/i.test(verb)) continue;
    out.push(issue(m.index, m.index + m[0].length, 'split-infinitive', `“${between}” sits between “to” and “${verb}”. Move some of it.`));
  }
  prepositionChains(text, out);
  for (const m of text.matchAll(LOUD))
    out.push(issue(m.index, m.index + m[0].length, 'loud-punctuation', `“${m[0]}” shouts. One mark is enough.`, [m[0].includes('?') && m[0].includes('!') ? '?!' : m[0][0]!]));
  for (const m of text.matchAll(GENDERED_RE)) {
    if (inSpeech(m.index)) continue;
    const plain = GENDERED[m[0].toLowerCase()]!;
    out.push(issue(m.index, m.index + m[0].length, 'gendered-word', `“${plain}” suits anyone who does the job.`, [matchCase(m[0], plain)]));
  }
  for (const m of text.matchAll(OPENING)) {
    if (inSpeech(m.index)) continue;
    out.push(issue(m.index, m.index + m[0].length, 'conjunction-start', `This sentence opens with “${m[1]}”.`));
  }
  return out;
}
