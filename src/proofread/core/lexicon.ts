/**
 * The words of English and what each can be: noun, verb, describing word, and the forms a verb
 * or noun takes. The open classes come from Sam's own dictionary, whose markings already say
 * which words take a plural (M, S), a past (D), an -ing (G), a comparative (R, T) or -ness (P),
 * so a word added to the dictionary joins the grammar too. Only the words English inflects
 * irregularly, and the small closed classes, are listed here.
 *
 * Nothing here decides what's a mistake. That's the grammar's job (core/grammar.ts), which asks
 * the lexicon what a word can be and which form a slot needs.
 */

/** base, simple past, past participle. Only verbs that don't simply add -ed. */
const IRREGULAR_VERBS = `arise arose arisen|awake awoke awoken|be was been|bear bore borne|beat beat beaten|become became become|begin began begun|bend bent bent|bet bet bet|bind bound bound|bite bit bitten|bleed bled bled|blow blew blown|break broke broken|breed bred bred|bring brought brought|build built built|burn burnt burnt|burst burst burst|buy bought bought|catch caught caught|choose chose chosen|cling clung clung|come came come|cost cost cost|creep crept crept|cut cut cut|deal dealt dealt|dig dug dug|do did done|draw drew drawn|dream dreamt dreamt|drink drank drunk|drive drove driven|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found|flee fled fled|fling flung flung|fly flew flown|forbid forbade forbidden|forget forgot forgotten|forgive forgave forgiven|freeze froze frozen|get got got|give gave given|go went gone|grind ground ground|grow grew grown|hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held|hurt hurt hurt|keep kept kept|kneel knelt knelt|know knew known|lay laid laid|lead led led|lean leant leant|leap leapt leapt|learn learnt learnt|leave left left|lend lent lent|let let let|lie lay lain|light lit lit|lose lost lost|make made made|mean meant meant|meet met met|mistake mistook mistaken|pay paid paid|put put put|quit quit quit|read read read|ride rode ridden|ring rang rung|rise rose risen|run ran run|say said said|see saw seen|seek sought sought|sell sold sold|send sent sent|set set set|sew sewed sewn|shake shook shaken|shed shed shed|shine shone shone|shoot shot shot|show showed shown|shrink shrank shrunk|shut shut shut|sing sang sung|sink sank sunk|sit sat sat|sleep slept slept|slide slid slid|sling slung slung|slit slit slit|speak spoke spoken|speed sped sped|spend spent spent|spin spun spun|spit spat spat|split split split|spread spread spread|spring sprang sprung|stand stood stood|steal stole stolen|stick stuck stuck|sting stung stung|stink stank stunk|stride strode stridden|strike struck struck|string strung strung|strive strove striven|swear swore sworn|sweep swept swept|swim swam swum|swing swung swung|take took taken|teach taught taught|tear tore torn|tell told told|think thought thought|throw threw thrown|thrust thrust thrust|tread trod trodden|understand understood understood|undertake undertook undertaken|upset upset upset|wake woke woken|wear wore worn|weave wove woven|weep wept wept|win won won|wind wound wound|withdraw withdrew withdrawn|wring wrung wrung|write wrote written`;

/** singular plural, for nouns that don't add -s; the regular-looking plural a learner makes is the mistake to catch. */
const IRREGULAR_NOUNS = `man men|woman women|child children|person people|foot feet|tooth teeth|goose geese|mouse mice|louse lice|ox oxen|knife knives|wife wives|life lives|leaf leaves|loaf loaves|half halves|shelf shelves|wolf wolves|thief thieves|calf calves|elf elves|self selves|sheaf sheaves|sheep sheep|deer deer|fish fish|aircraft aircraft|species species|series series|criterion criteria|phenomenon phenomena|cactus cacti|fungus fungi|crisis crises|thesis theses|analysis analyses|potato potatoes|tomato tomatoes|hero heroes|echo echoes`;

export type VerbForm = 'base' | 'present' | 'past' | 'participle' | 'ing';

export interface VerbReading {
  base: string;
  /** Every form the spelling can be: "cut" is base, present, past and participle at once. */
  forms: Set<VerbForm>;
}

interface Irregular {
  past: string;
  participle: string;
}

const verbs = new Map<string, Irregular>();
const pastOfIrregular = new Map<string, string>();
const participleOfIrregular = new Map<string, string>();
for (const entry of IRREGULAR_VERBS.split('|')) {
  const [base, past, participle] = entry.split(' ') as [string, string, string];
  verbs.set(base, { past, participle });
  if (!pastOfIrregular.has(past)) pastOfIrregular.set(past, base);
  if (!participleOfIrregular.has(participle)) participleOfIrregular.set(participle, base);
}

const pluralOf = new Map<string, string>();
const singularOf = new Map<string, string>();
for (const entry of IRREGULAR_NOUNS.split('|')) {
  const [one, many] = entry.split(' ') as [string, string];
  pluralOf.set(one, many);
  singularOf.set(many, one);
}

/**
 * The closed classes: pronouns, determiners, prepositions and joining words. The dictionary's
 * markings on these are noise ("me" carries a past), and English adds to them only once in a
 * few centuries, so they're never read as nouns, verbs or describing words.
 */
const FUNCTION_WORDS = new Set(
  `i me my mine you your yours he him his she her hers it its we us our ours they them their theirs myself yourself himself herself itself
  ourselves themselves this that these those a an the and or but nor so yet if because although though while when where whether which who
  whom whose what than as at by for from in into of on onto to with without about above across after against along among around before
  behind below beneath beside besides between beyond during except inside near off out outside over past since through throughout till
  toward towards under underneath until up upon via within not no yes how why here there then now very all both some any many much more
  most few such own other every each am is are was were be been being has have had do does did can could will would shall should
  may might must`.split(/\s+/),
);
export const isFunctionWord = (w: string) => FUNCTION_WORDS.has(w);

/** Dictionary markings for each word, from the .dic file. */
let flags = new Map<string, string>();
let known: (word: string) => boolean = () => false;

/**
 * Load the dictionary the grammar reads word classes from: the Hunspell .dic text and the
 * speller's own check (which knows every inflected form).
 */
export function useDictionary(dic: string, isWord: (word: string) => boolean): void {
  const next = new Map<string, string>();
  for (const line of dic.split('\n')) {
    const slash = line.indexOf('/');
    const word = (slash < 0 ? line : line.slice(0, slash)).trim();
    if (!word || /^\d+$/.test(word)) continue;
    const f = slash < 0 ? '' : line.slice(slash + 1).trim();
    next.set(word, (next.get(word) ?? '') + f + ' ');
  }
  flags = next;
  known = isWord;
}

export const hasDictionary = () => flags.size > 0;

/**
 * The dictionary doesn't mark every noun ("detail" has a past and an -ing but no possessive), so
 * usage can vouch for one too: books putting "the" or "a" before a word. The grammar sets this
 * from the word-pair counts.
 */
let usedAsNoun: (word: string) => boolean = () => false;
export function useNounEvidence(test: (word: string) => boolean): void {
  usedAsNoun = test;
}
const markedNoun = (w: string) => !!flagsOf(w)?.includes('M') || ((!!flagsOf(w) || known(w)) && usedAsNoun(w));
const flagsOf = (w: string) => (FUNCTION_WORDS.has(w) ? undefined : flags.get(w));
export const isWord = (w: string) => known(w);

/** Doubling the last consonant before -ed and -ing: stop → stopped. */
const doubled = (w: string) => (/[^aeiou][aeiou][bdgklmnprtvz]$/.test(w) ? w + w.at(-1) : null);

/** The regular -ed form, as the dictionary spells it. */
function regularEd(base: string): string {
  const d = doubled(base);
  if (d && known(`${d}ed`) && !known(`${base}ed`)) return `${d}ed`;
  if (base.endsWith('e')) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  return `${base}ed`;
}

function regularIng(base: string): string {
  const d = doubled(base);
  if (d && known(`${d}ing`) && !known(`${base}ing`)) return `${d}ing`;
  if (/[^e]e$/.test(base) && base !== 'be') return `${base.slice(0, -1)}ing`;
  if (base.endsWith('ie')) return `${base.slice(0, -2)}ying`;
  return `${base}ing`;
}

function regularS(base: string): string {
  if (/(?:s|x|z|ch|sh|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** Whether a spelling is a verb's plain form: the dictionary gives it a past or an -ing, or English inflects it irregularly. */
export function isVerbBase(w: string): boolean {
  if (verbs.has(w)) return true;
  const f = flagsOf(w);
  if (f && /[DG]/.test(f)) return true;
  // Some verbs are listed without markings and their forms listed apart: stop, stopped, stopping.
  // And some come from Sam's supplement, with no markings at all: known with an -ed and an -ing.
  return (!!f || (known(w) && !/(?:ed|ing)$/.test(w) && !(w.endsWith("s") && !w.endsWith("ss") && known(w.slice(0, -1))))) && w.length > 2 && known(regularIng(w)) && known(regularEd(w)) && regularIng(w) !== w;
}

export interface VerbParts {
  base: string;
  present: string;
  past: string;
  participle: string;
  ing: string;
}

export function partsOf(base: string): VerbParts {
  if (base === 'be') return { base, present: 'is', past: 'was', participle: 'been', ing: 'being' };
  if (base === 'have') return { base, present: 'has', past: 'had', participle: 'had', ing: 'having' };
  if (base === 'do') return { base, present: 'does', past: 'did', participle: 'done', ing: 'doing' };
  if (base === 'go') return { base, present: 'goes', past: 'went', participle: 'gone', ing: 'going' };
  const irregular = verbs.get(base);
  const ed = regularEd(base);
  return { base, present: regularS(base), past: irregular?.past ?? ed, participle: irregular?.participle ?? ed, ing: regularIng(base) };
}

/** What a spelling can be as a verb, if anything. */
export function readVerb(w: string): VerbReading | null {
  if (FUNCTION_WORDS.has(w)) return null;
  const forms = new Set<VerbForm>();
  let base: string | null = null;
  const take = (b: string, ...fs: VerbForm[]) => {
    if (base !== null && base !== b) return;
    base = b;
    for (const f of fs) forms.add(f);
  };
  // The irregular forms first: "sat" is "sit", whatever else the dictionary lists it as.
  const pastBase = pastOfIrregular.get(w);
  if (pastBase) take(pastBase, 'past');
  const partBase = participleOfIrregular.get(w);
  if (partBase) take(partBase, 'participle');
  if (isVerbBase(w)) {
    // "wound" is "wind" in the past and a verb of its own: keep both readings, under the irregular one's name.
    if (base !== null && base !== w) for (const f of ['base', 'present'] as const) forms.add(f);
    else take(w, 'base', 'present');
  }
  if (w === 'is' || w === 'am' || w === 'are') take('be', 'present');
  if (w === 'were') take('be', 'past');
  if (w === 'has') take('have', 'present');
  if (w === 'does') take('do', 'present');
  if (w === 'goes') take('go', 'present');
  if (base === null && w.length > 3) {
    for (const [end, back] of [
      ['ied', 'y'],
      ['d', ''],
      ['ed', ''],
    ] as const) {
      if (!w.endsWith(end)) continue;
      const b = w.slice(0, -end.length) + back;
      if (isVerbBase(b) && !verbs.has(b) && partsOf(b).past === w) {
        take(b, 'past', 'participle');
        break;
      }
    }
    if (base === null && /([bdgklmnprtvz])\1ed$/.test(w)) {
      const b = w.slice(0, -3);
      if (isVerbBase(b) && !verbs.has(b)) take(b, 'past', 'participle');
    }
    if (base === null && w.endsWith('ing')) {
      for (const b of [w.slice(0, -3), `${w.slice(0, -3)}e`, w.slice(0, -4), `${w.slice(0, -4)}ie`]) {
        if (b.length > 1 && isVerbBase(b) && partsOf(b).ing === w) {
          take(b, 'ing');
          break;
        }
      }
    }
    if (base === null && w.endsWith('s')) {
      for (const b of [w.slice(0, -1), w.slice(0, -2), `${w.slice(0, -3)}y`]) {
        if (b.length > 1 && isVerbBase(b) && partsOf(b).present === w) {
          take(b, 'present');
          break;
        }
      }
    }
  }
  return base === null ? null : { base, forms };
}

/** Whether the dictionary lists a spelling as a noun (it takes a possessive), in either number. */
export function isNoun(w: string): boolean {
  if (FUNCTION_WORDS.has(w)) return false;
  if (singularOf.has(w) || pluralOf.has(w)) return true;
  if (markedNoun(w)) return true;
  const one = singular(w);
  return one !== null && one !== w && markedNoun(one);
}

/** The singular of a plural noun ("knives" → "knife", "boxes" → "box"), or null if it isn't one. */
export function singular(w: string): string | null {
  const irregular = singularOf.get(w);
  if (irregular) return irregular === w ? null : irregular;
  if (!w.endsWith('s') || w.endsWith('ss') || w.length < 3) return null;
  for (const b of [w.slice(0, -1), w.slice(0, -2), `${w.slice(0, -3)}y`]) if (b.length > 1 && markedNoun(b) && pluralNoun(b) === w) return b;
  return null;
}

/** The plural of a noun, irregular ones included. */
export function pluralNoun(one: string): string {
  return pluralOf.get(one) ?? (/[^aeiou]o$/.test(one) && !known(`${one}s`) ? `${one}es` : regularS(one));
}

/** The plural a learner builds by rule for a noun English makes irregular: knifes, mouses, childs. Null if it's regular. */
export function regularisedPlural(w: string): string | null {
  for (const [one, many] of pluralOf) {
    if (w === `${many}s` && !known(w)) return many;
    if (one === many || many === regularS(one)) continue;
    if (w === regularS(one) || w === `${one}s`) return many;
  }
  return null;
}

/** Whether the dictionary marks a spelling as a describing word: it compares (-er, -est) or takes -ness. */
export function isAdjective(w: string): boolean {
  const f = flagsOf(w);
  return !!f && /[TP]/.test(f);
}

/** Whether the dictionary lists the spelling at all, as a headword. */
export const isHeadword = (w: string) => flags.has(w);
