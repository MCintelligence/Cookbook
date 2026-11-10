/** Verb forms the grammar checks share. */

/**
 * Simple past tenses that don't end in -ed. Fiction is told in the past, so these come up on
 * every page: Harper's verb agreement must not read "she hid" as "she hides", and Pete's
 * run-on check needs to know a clause has a verb.
 */
export const PAST_TENSES = new Set(
  'arose awoke bore beat became began bent bet bid bit bled blew broke bred brought built burnt burned burst bought cast caught chose clung came cost crept cut dealt dug dove drew dreamt drank drove dwelt ate fell fed felt fought found fled flung flew forbade forgot forgave froze got gave went ground grew hung had heard hid hit held hurt kept knelt knit knew laid led leant leapt learnt left lent let lay lit lost made meant met mistook paid put quit read rode rang rose ran said saw sought sold sent set sewed shook shed shone shot showed shrank shut sang sank sat slew slept slid slung slit smelt spoke sped spelt spent spilt spun spat split spread sprang stood stole stuck stung stank strode struck strung strove swore swept swam swung took taught tore told thought threw thrust trod understood upset woke wore wove wed wept won wound withdrew wrung wrote'.split(' '),
);

/** A past tense: "-ed", one of the irregular ones, or one with a prefix ("foresaw", "overcame"). */
export function isPast(word: string): boolean {
  if (/[^e]ed$/.test(word) && word.length > 4) return true;
  if (PAST_TENSES.has(word)) return true;
  const prefix = /^(?:fore|over|under|with|mis|re|out|up|be)/.exec(word);
  return !!prefix && PAST_TENSES.has(word.slice(prefix[0].length));
}
