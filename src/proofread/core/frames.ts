/**
 * What words ask of the words around them: which form a helper verb wants after it, which
 * prepositions a verb or describing word takes, which nouns name people. This is data, kept
 * apart from the grammar that reads it, so English moving on (a new usage, a verb that starts
 * taking an object) is a change to a list, not to the rules.
 */

import { type VerbForm } from './lexicon';

const words = (s: string) => new Set(s.trim().split(/\s+/));

/** Helper verbs and the form of the verb they govern. "be" governs two: "is eating", "was eaten". */
export const GOVERNS: Record<string, VerbForm[]> = Object.fromEntries([
  ...'can could will would shall should may might must'.split(' ').map((m) => [m, ['base']]),
  ...["can't", 'cannot', "couldn't", "won't", "wouldn't", "shouldn't", "mustn't", "mightn't", "shan't"].map((m) => [m, ['base']]),
  ...['do', 'does', 'did', "don't", "doesn't", "didn't"].map((m) => [m, ['base']]),
  ...['have', 'has', 'had', "haven't", "hasn't", "hadn't", "'ve", "'d"].map((m) => [m, ['participle']]),
  ...['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', "isn't", "aren't", "wasn't", "weren't", "'m", "'re"].map((m) => [m, ['ing', 'participle']]),
]);

/** Words that may stand between a helper and its verb: "could never go", "has already gone". */
export const BETWEEN = words(`not n't never just already also always often sometimes usually really even still ever only probably certainly
  definitely simply finally actually suddenly quickly slowly soon then now once rarely seldom hardly barely nearly almost all both each`);

/** Prepositions that take a noun or an -ing, never a plain verb: "interested in learning", not "in learn". */
export const PREPOSITIONS_BEFORE_ING = words('in of about for without before after by at on from instead besides despite');

/**
 * Feelings a thing causes and a person has. The -ing form describes the cause ("a boring
 * film"), the -ed form the one who feels it ("I was bored"), and each feeling has its own
 * prepositions after the -ed form ("interested in", "tired of").
 */
export const FEELINGS: Record<string, string[]> = {
  interest: ['in'],
  bore: ['of'],
  tire: ['of'],
  scare: ['of'],
  frighten: ['of'],
  terrify: ['of'],
  excite: ['about'],
  embarrass: ['about'],
  confuse: ['about'],
  depress: ['about'],
  satisfy: ['with'],
  disappoint: ['with'],
  please: ['with'],
  fascinate: ['by'],
  thrill: ['about'],
  amaze: [],
  surprise: [],
  shock: [],
  amuse: [],
  annoy: [],
  frustrate: [],
  disgust: [],
  irritate: [],
  astonish: [],
  puzzle: [],
  overwhelm: [],
  horrify: [],
  exhaust: [],
};

/** Things and happenings that can bore or interest someone but can't feel it themselves. */
export const EVENTS = words(`film films movie movies book books story stories novel novels lesson lessons lecture lectures talk speech game games
  match trip journey holiday vacation party meeting meetings job work course subject topic programme program show shows play concert news
  result results situation idea question questions answer experience weather view food meal music song songs conversation discussion task
  exam exams test tests homework article report presentation process museum city town weekend`);

/**
 * People and animals: the ones who own things and feel things. Kin, roles and jobs; the tagger
 * knows names. Used to tell "my sister's car" from "a sports car".
 */
export const PEOPLE = words(`mother father mum mom dad parent parents sister sisters brother brothers aunt uncle cousin cousins wife husband son
  daughter grandmother grandfather grandma grandpa grandparents friend friends boyfriend girlfriend neighbour neighbor neighbours neighbors boss
  teacher teachers doctor nurse lawyer manager colleague colleagues partner landlord landlady owner king queen
  man woman boy girl child cook chef baker driver player`);

/** People who come in numbers: "all the students". Owners above, plus roles nobody owns things as. */
export const COUNTED_PEOPLE = new Set([...PEOPLE, ...'student guest worker visitor customer passenger soldier tourist child member employee'.split(' ')]);

/** Things people own or have, after an owner with no 's: "my sisters car", "John bicycle". */
export const BELONGINGS = words(`car cars house home flat apartment room bedroom desk bag bags phone bike bicycle book books coat hat shoes dog cat
  name wedding birthday office computer laptop keys wallet money idea advice job address garden kitchen face hand hands voice eyes hair
  clothes letter letters dress jacket umbrella pen pencil toys friend friends husband wife family party opinion help apron uniform glasses watch ring shirt boots`);

/**
 * Verbs that take their object straight, with no preposition, and the prepositions learners
 * put in: "discuss about", "enter into the room". Each lists what may follow the preposition
 * for it to be the mistake, when the verb has a proper use with it too ("enter into an
 * agreement", "the curtains reached to the floor").
 */
export const DIRECT_OBJECT: Record<string, { preps: string[]; only?: Set<string> }> = {
  discuss: { preps: ['about', 'on'] },
  mention: { preps: ['about'] },
  describe: { preps: ['about'] },
  emphasize: { preps: ['on'] },
  emphasise: { preps: ['on'] },
  marry: { preps: ['with'], only: words('him her me them you') },
  resemble: { preps: ['to', 'with'] },
  enter: { preps: ['into', 'in'], only: words('room house building kitchen hall office classroom shop store church restaurant car bedroom bathroom garden park library') },
  reach: { preps: ['to', 'at'], only: words('station airport city town village hotel school home destination office house top summit border coast') },
  answer: { preps: ['to'], only: words('question questions') },
  attend: { preps: ['to', 'at'], only: words('school class classes meeting meetings lecture lectures church college university course wedding party funeral conference') },
  approach: { preps: ['to'], only: words('door house man woman girl boy table window desk car') },
  join: { preps: ['to'], only: words('team club group army party us them me him her') },
  contact: { preps: ['with', 'to'] },
  lack: { preps: ['of'] },
  inform: { preps: ['to'] },
};

/** Verbs that need a preposition before their object: "listen to", "wait for". The object may not follow bare. */
export const NEEDS_PREPOSITION: Record<string, string> = {
  listen: 'to',
  wait: 'for',
  depend: 'on',
  belong: 'to',
  happen: 'to',
  apologize: 'to',
  apologise: 'to',
  agree: 'with',
  complain: 'about',
  arrive: 'at',
  reply: 'to',
  respond: 'to',
  graduate: 'from',
};

/** Verbs that can't take a person straight after them: "explain me the rules" is "explain the rules to me". */
export const NO_INDIRECT_OBJECT = words('explain describe suggest say announce mention recommend introduce report');

/** Verbs of going, and the kinds of place they go to with "to": "went to the beach", not "went the beach". */
export const GOING = words('go goes went gone going come comes came coming return returns returned');
export const PLACES = words(`beach park shop shops store market school college university office library hospital church museum airport station
  bank restaurant cinema theatre theater zoo mall gym party city town village country countryside mountains sea seaside lake river island
  concert doctor dentist supermarket bakery pub cafe café hotel museum`);

/** Describing words and the preposition each takes, against the ones learners reach for. */
export const ADJECTIVE_PREPOSITION: Record<string, { right: string; wrong: string[] }> = {
  angry: { right: 'with', wrong: ['on'] },
  interested: { right: 'in', wrong: ['on', 'for', 'about', 'at'] },
  proud: { right: 'of', wrong: ['on', 'for', 'with'] },
  responsible: { right: 'for', wrong: ['of'] },
  famous: { right: 'for', wrong: ['with', 'of'] },
  similar: { right: 'to', wrong: ['with', 'as'] },
  capable: { right: 'of', wrong: ['to', 'for'] },
  aware: { right: 'of', wrong: ['about', 'from'] },
  fond: { right: 'of', wrong: ['with', 'to', 'on'] },
  jealous: { right: 'of', wrong: ['on', 'from', 'to'] },
  keen: { right: 'on', wrong: ['in', 'for'] },
  dependent: { right: 'on', wrong: ['of', 'from'] },
  independent: { right: 'of', wrong: ['from'] },
  addicted: { right: 'to', wrong: ['on', 'with'] },
  full: { right: 'of', wrong: ['with'] },
  afraid: { right: 'of', wrong: ['from'] },
};

/** Determiners and the number of noun they take. */
export const ONE = words('a an each every another');
export const MANY = words('these those many several few various numerous both');

/** "one of the …", "each of my …": one or some of many, so the noun is plural. ("some of the cake" can be one thing.) */
export const SHARE_COUNTED = words('one each several both many few either neither');

/** Nouns whose plural looks the same, or that are plural in form and one in sense. */
export const SAME_NUMBER = words(`news means physics mathematics politics economics series species thanks clothes glasses scissors trousers pants
  riches odds sheep deer fish divers stairs aircraft headquarters crossroads barracks whereabouts athletics gymnastics measles billiards`);

/** Time words a verb can take straight, without its preposition: "wait a minute", "arrived the next day". */
export const TIME_NOUNS = words(`minute minutes moment moments second seconds while bit day days week weeks year years night morning evening time
  hour hours few little long whole next same rest following other last first`);

/** Verbs that take two objects, so a name then a noun is two objects, not an owner: "gave John money". */
export const TWO_OBJECTS = words(`give send buy bring show tell offer lend pay hand teach get pass throw sell make find owe wish promise ask cook
  bake write leave call name save fetch allow deny cost charge read sing`);

/** Nouns that read as one group and fit "one of the family". */
export const GROUPS = words(`tribe cloud flock herd swarm host number pack school family crowd team party gang household company group staff crew audience class public police people
  clergy cattle government committee army navy band choir club`);

/** Words that say how often, and go after "be": "I am always late", not "I always am late". */
export const HOW_OFTEN = words('always usually often sometimes seldom rarely generally normally frequently occasionally');

/** Words that make a describing word stronger, and so must be followed by one: "very beautiful", not "very beauty". */
export const INTENSIFIERS = words('very too extremely really quite incredibly highly terribly awfully');

/**
 * Endings that turn a noun (or a quality) into a describing word, in the order to try them:
 * beauty → beautiful, danger → dangerous, luck → lucky, patience → patient, happiness → happy.
 */
export const TO_ADJECTIVE: [RegExp, string][] = [
  [/y$/, 'iful'],
  [/$/, 'ful'],
  [/$/, 'ous'],
  [/e$/, 'ous'],
  [/$/, 'y'],
  [/e$/, 'y'],
  [/$/, 'al'],
  [/$/, 'ic'],
  [/$/, 'able'],
  [/e$/, 'able'],
  [/$/, 'ive'],
  [/ce$/, 't'],
  [/iness$/, 'y'],
  [/ness$/, ''],
  [/osity$/, 'ous'],
  [/ity$/, ''],
  [/ility$/, 'le'],
  [/th$/, ''],
  [/ion$/, 'ive'],
  [/y$/, 'ic'],
];

/** Verbs that link a subject to a description and so take a describing word, never an -ly word: "seemed happy". */
export const LINKING = words('seem seems seemed become becomes became');
