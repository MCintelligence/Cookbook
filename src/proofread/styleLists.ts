/**
 * Spicy Sally's lists. Kept apart from the rules in style.ts so they can grow
 * without burying the logic. A phrase may hold {a|b} slots: “{her|his|their}”
 * stands for each pronoun, “{let|lets|letting}” for each form of the verb.
 */

/** Every phrase a pattern with {a|b} slots stands for. An empty choice, as in {up |}, drops the word. */
export function expand(pattern: string): string[] {
  const slot = /\{([^{}]*)\}/.exec(pattern);
  if (!slot) return [pattern.replace(/\s+/g, ' ').trim()];
  const head = pattern.slice(0, slot.index);
  const tail = pattern.slice(slot.index + slot[0].length);
  return slot[1]!.split('|').flatMap((choice) => expand(head + choice + tail));
}

const all = (patterns: string[]) => [...new Set(patterns.flatMap(expand))];

/** A list written as text: entries split by “;” or new lines, and lines starting with # are headings. */
const list = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.split(';'))
    .map((entry) => entry.trim())
    .filter(Boolean);

/** Words that pad a sentence without adding meaning. Speech is left alone. */
export const FILLERS = all(
  list(`
just; really; very; suddenly; somehow; actually; literally; basically; totally; definitely; simply; {began|begins|begin|beginning} to
{started|starts|start|starting} to; {seemed|seems|seem} to; {managed|manages|manage} to; quite; rather; somewhat; fairly; slightly; utterly; truly
essentially; practically; virtually; certainly; obviously; clearly; surely; seriously; honestly; frankly; absolutely; completely; entirely; incredibly
extremely; highly; particularly; generally; mostly; largely; perhaps; apparently; evidently; presumably; pretty much; more or less; kind of; sort of
a bit; a little bit; in fact; of course; as a matter of fact; for the most part; to be honest; at all; in a way; all in all
{proceeded|proceeds|proceed} to; {tried|tries|try} to {start|begin}; {couldn’t|could not} help but; {was|were} able to
`),
);

/** Fillers that are often not fillers, and the words around them that say so. */
export const FILLER_GUARDS: Record<string, RegExp> = {
  // “a kind of bread”, “that sort of thing”: a noun's kind, not a hedge.
  'kind of': /(?:\b(?:a|the|this|that|what|some|any|every|one|no|same|other|his|her|their|its|our|my|your)\s+)$/iu,
  'sort of': /(?:\b(?:a|the|this|that|what|some|any|every|one|no|same|other|his|her|their|its|our|my|your)\s+)$/iu,
  // “not quite” is a real measure.
  quite: /\bnot\s+$/iu,
};

/** What follows a filler that shows it is doing real work: “a bit of cake” is a piece, “quite a few” a number. */
export const FILLER_AFTER_GUARDS: Record<string, RegExp> = {
  'a bit': /^\s+of\b/iu,
  'a little bit': /^\s+of\b/iu,
  'at all': /^\s+(?:costs|times|hours|events)\b/iu,
  quite: /^\s+(?:a|an)\s+(?:few|lot|bit|while)\b/iu,
  // “rather than” compares; it isn't a hedge.
  rather: /^\s+than\b/iu,
};

/** Tired phrases. */
export const CLICHES = list(`
at the end of the day; avoid like the plague; better late than never; {blood ran|blood runs} cold; busy as a bee; {the |}calm before the storm
cold as ice; cool as a cucumber; dead as a doornail; easier said than done; every cloud has a silver lining; fit as a fiddle; flat as a pancake
heart of gold; in the nick of time; it goes without saying; last but not least; light as a feather; only time will tell; quiet as a mouse
scared to death; sick as a dog; {slept|sleep|sleeps|sleeping} like a log; think outside the box; time heals all wounds; tip of the iceberg
all walks of life; at a loss for words; {her|his|my|their|your} {heart|hearts} {skipped|skips} a beat; {got|get|gets|getting} down to brass tacks
{her|his|my|their} heart {pounded|hammered|thudded|raced} in {her|his|my|their} chest
{let|lets|letting|released|releases|releasing|exhaled|exhales} {out |}a breath {she|he|I|they|you} {didn’t|did not|hadn’t} know {she|he|I|they|you}{ was| were| had been|’d been} holding
{a|the} {chill|shiver} {ran|runs|went|crept|raced} down {her|his|my|their} spine; shiver down {her|his|my|their} spine; {a |}dark and stormy night
eyes like saucers; in the blink of an eye; like a kid in a candy store; more than meets the eye; needle in a haystack; raining cats and dogs
read between the lines; stood the test of time; the writing on the wall; {took|takes|taking} {her|his|my|their|your} breath away; white as a sheet
white as a ghost; pale as a ghost; without further ado; all of a sudden; out of the blue; nerves of steel; sharp as a tack; smart as a whip
quick as a flash; drop in the bucket; piece of cake; once in a blue moon; when pigs fly; the apple of {her|his|my|their} eye
little did {she|he|they|I|we} know; time stood still; frozen in time; like a moth to a flame; butterflies in {her|his|my|their} stomach; a single tear
pregnant pause; deafening silence; hit the ground running; in this day and age; needless to say; a matter of time
# Bodies on autopilot
{her|his|my|their} jaw dropped; {her|his|my|their} {eyes|gaze} bore into; eyes {widened|widen} in {surprise|shock|horror}
{her|his|my|their} stomach {churned|dropped|lurched|knotted|did a flip}; {bit|bites|biting} {her|his|my|their} lip
{rolled|rolls|rolling} {her|his|my|their} eyes; {ran|runs|running} a hand through {her|his|my|their} hair; a lump in {her|his|my|their} throat
a knot in {her|his|my|their} stomach; {her|his|my|their} blood boiled; seeing red; tears streamed down {her|his|my|their} {face|cheeks}
{her|his|my|their} knees {went|turned} weak; weak at the knees; {her|his|my|their} heart sank
{her|his|my|their} heart {was |}in {her|his|my|their} throat; heart in {her|his|my|their} mouth
a smile tugged at {the corners of |}{her|his|my|their} {lips|mouth}; {the |}corners of {her|his|my|their} mouth twitched
let out a {sigh of relief|breath of relief}; breathed a sigh of relief; sigh of relief; {her|his|my|their} breath caught; hair stood on end
goosebumps {rose|prickled} on {her|his|my|their} {arms|skin}; an icy finger; a wave of {nausea|relief|fear|panic} {washed|swept} over
every fibre of {her|his|my|their} being; every fiber of {her|his|my|their} being; with bated breath; on the edge of {her|his|my|their} seat
as if {she|he|they|I} had seen a ghost; cut like a knife; the silence was deafening; you could hear a pin drop; could have heard a pin drop
the air was thick with tension; you could cut the tension with a knife; a heavy silence; orbs; emerald orbs; sapphire orbs; cerulean orbs
eyes like {limpid |}pools
# Similes worn smooth
as old as the hills; as good as gold; as brave as a lion; as blind as a bat; as clear as a bell; as clear as day; as clear as mud; as cold as ice
as dry as a bone; bone dry; as dull as ditchwater; as easy as pie; as free as a bird; as hard as nails; as happy as a clam; as happy as Larry
as keen as mustard; as large as life; as mad as a hatter; as plain as day; as pretty as a picture; as proud as a peacock; as red as a beet
as right as rain; right as rain; as safe as houses; as snug as a bug in a rug; as stiff as a board; as strong as an ox; as stubborn as a mule
as thick as thieves; as tough as old boots; as ugly as sin; as warm as toast; as wise as an owl; as quick as lightning; as black as night
as black as coal; as dark as night; as white as snow; as old as time; as hungry as a wolf; as sly as a fox; like a deer in the headlights
like a bull in a china shop; like a fish out of water; like two peas in a pod; like a house on fire; like a ton of bricks; like a bat out of hell
like clockwork; like the back of {her|his|my|their|your} hand; like a rolling stone; like the plague; like a lamb to the slaughter
like a well-oiled machine; fits like a glove; spread like wildfire; slept like a baby; ran like the wind; like a rabbit in the headlights
like a cat on a hot tin roof; like there was no tomorrow; like it was going out of style
# Sayings
add insult to injury; against all odds; all in a day’s work; all’s fair in love and war; at the drop of a hat; back to square one
back to the drawing board; barking up the wrong tree; beat around the bush; beggars can’t be choosers; bite the bullet
bite off more than {she|he|they|I|you} could chew; blessing in disguise; break the ice; burn the midnight oil
by the skin of {her|his|my|their|your} teeth; call it a day; can’t judge a book by its cover; cat got your tongue; crystal clear; cry over spilt milk
cry over spilled milk; cut corners; dead of night; devil’s advocate; don’t count your chickens; down to earth; every dog has its day; face the music
fall on deaf ears; few and far between; fish out of water; from the bottom of {her|his|my|their|your} heart; get out of hand
give the benefit of the doubt; go the extra mile; grass is always greener; hit the nail on the head; hit the sack; hold {her|his|my|their|your} horses
in hot water; in the same boat; it’s not rocket science; jump on the bandwagon; keep {her|his|my|their|your} chin up; kill two birds with one stone
leave no stone unturned; let the cat out of the bag; lost track of time; make a long story short; to make a long story short; long story short
miss the boat; no pain, no gain; off the beaten track; off the beaten path; on cloud nine; on the ball; on thin ice; once and for all; over the moon
play it by ear; pull {her|his|my|their|your} leg; pull out all the stops; rain on {her|his|my|their|your} parade; rule of thumb; see eye to eye
sit on the fence; speak of the devil; spill the beans; state of the art; steal {her|his|my|their|your} thunder; take it with a grain of salt
take it with a pinch of salt; the ball is in {her|his|my|their|your} court; the best of both worlds; the bigger they are, the harder they fall
the elephant in the room; the last straw; the straw that broke the camel’s back; the whole nine yards; through thick and thin; throw in the towel
tie the knot; to the bitter end; turn over a new leaf; under the weather; until the cows come home; up in the air; water under the bridge
when all is said and done; with flying colours; with flying colors; you can’t have your cake and eat it; a blast from the past; a dime a dozen
a far cry from; a fly on the wall; a perfect storm; a race against time; a race against the clock; a stone’s throw; a whole new ball game
actions speak louder than words; all hell broke loose; an arm and a leg; as luck would have it; at long last; bigger than life; larger than life
by and large; calm, cool and collected; cold feet; dead tired; dead silence; dog-eat-dog; easy come, easy go; fair and square; fast and furious
first and foremost; for all intents and purposes; from dawn to dusk; gentle giant; hustle and bustle; in the heat of the moment; in the dead of night
it was all a dream; it was only a dream; lady luck; lap of luxury; like it or not; live and learn; lock, stock and barrel; love at first sight
nip it in the bud; nothing could be further from the truth; old as dirt; par for the course; plenty of fish in the sea; pushing up daisies
rags to riches; ripe old age; sadder but wiser; safe and sound; scared stiff; scared out of {her|his|my|their} wits; set in stone; sick and tired
slowly but surely; small world; stop and smell the roses; stick out like a sore thumb; sticks out like a sore thumb; take the bull by the horns
the moment of truth; the tide turned; the tables turned; the rest is history; the sands of time; the world is {her|his|my|their|your} oyster
time flies; time is of the essence; to die for; touch and go; tried and true; twist of fate; cruel twist of fate; up at the crack of dawn
at the crack of dawn; wake-up call; what goes around comes around; when it rains, it pours; worth {her|his|its|their} weight in gold; young at heart
a dark and stormy night; it was a dark and stormy night; all’s well that ends well; avoid it like the plague; brave new world; the dark side
the eye of the storm; trial by fire; the light at the end of the tunnel; light at the end of the tunnel; out of the frying pan
the calm after the storm; the jury is still out; jury is still out; think on {her|his|my|their|your} feet; thinking outside the box
level playing field; move the goalposts; moving the goalposts; paradigm shift; win-win
`);

/**
 * Phrases that say a thing twice, and the shorter way. In the shorter way $1, $2…
 * stand for the words the phrase's slots matched, and a slot written out again
 * (as in {her|his}) takes the same word as the phrase's.
 */
export const REDUNDANCIES: [string, string][] = list(`
each and every => each; free gift => gift; past history => history; end result => result; close proximity => proximity
absolutely essential => essential; added bonus => bonus; advance planning => planning; completely finished => finished; final outcome => outcome
unexpected surprise => surprise; reason why => reason; {revert|reverted|reverting} back => $1; {return|returned|returning|returns} back => $1
{repeat|repeated|repeating} again => $1; {join|joined} together => $1; {combine|combined} together => $1; {merge|merged} together => $1; {plan|planned} ahead => $1
basic fundamentals => fundamentals; true facts => facts; past experience => experience; sum total => total; first began => began
still remains => remains; {shrug|shrugged|shrugs} {her|his|my|their|your} shoulders => $1
{nod|nodded|nods} {her|his|my|their|your} {head|heads} => $1; {blink|blinked|blinks} {her|his|my|their|your} eyes => $1
stood up to {her|his|their} feet => stood up; {whispered|whispers} quietly => $1; {shouted|shouts|yelled|screamed} loudly => $1
{ascend|ascended} up => $1; {descend|descended} down => $1; {circle|circled} around => $1; collaborate together => collaborate
completely empty => empty; completely full => full; entirely unique => unique; very unique => unique; new innovation => innovation
over exaggerate => exaggerate; brief moment => moment; tiny little => tiny; empty space => space; {mix|mixed} together => $1
{gather|gathered} together => $1
# More of the same
advance warning => warning; all-time record => record; armed gunman => gunman; ATM machine => ATM; PIN number => PIN; blatantly obvious => obvious
brand new => new; cancel out => cancel; collaborate jointly => collaborate; completely surrounded => surrounded; completely destroyed => destroyed
totally destroyed => destroyed; utterly destroyed => destroyed; consensus of opinion => consensus; current trend => trend; dead body => body
definite decision => decision; difficult dilemma => dilemma; direct confrontation => confrontation; during the course of => during
earlier in time => earlier; eliminate altogether => eliminate; emergency situation => emergency; enter in => enter; equal to one another => equal
estimated at about => estimated at; exact same => same; actual fact => fact; false pretense => pretense; false pretence => pretence
few in number => few; final conclusion => conclusion; first and foremost => first; first time ever => first time; foreign imports => imports
frozen ice => ice; future plans => plans; general consensus => consensus; grow in size => grow; had done previously => had done
harmful injury => injury; honest truth => truth; hot water heater => water heater; hurry up => hurry; in close proximity => near; input into => input
integrate together => integrate; interact with each other => interact; joint collaboration => collaboration; kneel down => kneel; knelt down => knelt
last of all => last; lift up => lift; lifted up => lifted; live studio audience => studio audience; look back in retrospect => look back
major breakthrough => breakthrough; meet together => meet; met together => met; might possibly => might; mutual cooperation => cooperation
natural instinct => instinct; never before => never; now pending => pending; old adage => adage; old cliché => cliché; open up => open
opened up => opened; originally created => created; outside of => outside; over and done with => done; overused cliché => cliché
palm of {her|his|my|their|your} hand => palm; passing fad => fad; penetrate into => penetrate; personal friend => friend; personal opinion => opinion
pick and choose => choose; plan in advance => plan; plans for the future => plans; pre-plan => plan; preplan => plan; protest against => protest
raise up => raise; raised up => raised; reason is because => reason is that; recur again => recur; refer back => refer; reply back => reply
replied back => replied; rise up => rise; rose up => rose; safe haven => haven; same identical => identical; scrutinize carefully => scrutinize
separated apart => separated; shut down completely => shut down; sink down => sink; sank down => sank; slow speed => slowly; small in size => small
spell out in detail => spell out; spliced together => spliced; start off => start; started off => started; still persists => persists
sudden impulse => impulse; suddenly exploded => exploded; surrounded on all sides => surrounded; temper tantrum => tantrum
ten a.m. in the morning => ten a.m.; three a.m. in the morning => three a.m.; totally unanimous => unanimous; true fact => fact; twelve noon => noon
twelve midnight => midnight; unintended mistake => mistake; usual custom => custom; vast majority => majority; visible to the eye => visible
warn in advance => warn; warned in advance => warned; whether or not => whether; written down => written; wrote down => wrote; young child => child
young children => children; {thought|think|thinks} to {herself|himself|myself|themselves} => $1; {stood|stand|stands} up straight => straightened
{sat|sit|sits} down on the {chair|sofa|couch|bed|floor} => $1 on the $2; {crouched|crouch|crouches} down => $1; {squatted|squat} down => $1
{stared|stare|stares} fixedly => $1; {smiled|smile|smiles} happily => $1; {frowned|frown|frowns} unhappily => $1
{sprinted|sprint|sprints} quickly => $1; {crept|creep|creeps} quietly => $1; {tiptoed|tiptoe|tiptoes} quietly => $1
{slammed|slam|slams} the door shut => $1 the door; {clapped|clap|claps} {her|his|my|their} hands together => $1 {her|his|my|their} hands
{shook|shake|shakes} {her|his|my|their} head no => $1 {her|his|my|their} head; {nodded|nod|nods} yes => $1; {listened|listen|listens} carefully => $1
{whispered|whisper|whispers} softly => $1; {yelled|yell|yells} out loud => $1; in my opinion, I think => I think; I personally => I
period of time => period; at this moment in time => now; at that point in time => then; each individual => each; various different => various
continue on => continue; continued on => continued; still continues => continues; crisis situation => crisis; puzzling mystery => mystery
`).map((entry) => entry.split(' => ') as [string, string]);

/** Wordy phrases and the plain word for them. */
export const WORDY: Record<string, string> = Object.fromEntries(
  (
    [
      ['{made|make|makes|making} a decision', ['decided', 'decide', 'decides', 'deciding']],
      ['{came|come|comes|coming} to the conclusion', ['concluded', 'conclude', 'concludes', 'concluding']],
      ['{came|come|comes|coming} to a decision', ['decided', 'decide', 'decides', 'deciding']],
      ['{gave|give|gives|giving} consideration to', ['considered', 'consider', 'considers', 'considering']],
      ['{made|make|makes|making} an attempt', ['tried', 'try', 'tries', 'trying']],
      ['{made|make|makes|making} a suggestion', ['suggested', 'suggest', 'suggests', 'suggesting']],
      ['{took|take|takes|taking} into consideration', ['considered', 'consider', 'considers', 'considering']],
      ['{has|have|had} the ability to', ['can', 'can', 'could']],
      ['{is|are} able to', ['can', 'can']],
      ['{is|are|was|were} in a position to', ['can', 'can', 'could', 'could']],
      ['{has|have|had} a tendency to', ['tends to', 'tend to', 'tended to']],
    ] as [string, string[]][]
  )
    .flatMap(([pattern, fixes]) => expand(pattern).map((phrase, i) => [phrase, fixes[i]!] as [string, string]))
    .concat(
      list(`
in the near future => soon; a large number of => many; a great number of => many; the majority of => most; on a daily basis => daily
on a regular basis => regularly; in the vicinity of => near; in the absence of => without; in excess of => more than
in the course of => during; by means of => by; in an effort to => to; so as to => to; with the exception of => except
in light of the fact that => because; owing to the fact that => because; despite the fact that => although; until such time as => until
at all times => always; in a timely manner => promptly; for the reason that => because; on the grounds that => because
in the amount of => for; a sufficient number of => enough; a small number of => a few
`).map((entry) => entry.split(' => ') as [string, string]),
    ),
);

/** Words ending in -ed that read as adjectives after “was” far more often than as the passive. */
export const NOT_PASSIVE = new Set(
  `tired excited interested bored scared worried pleased surprised married supposed used named bed red shed sled born located
  done finished dressed closed engaged prepared determined convinced concerned involved related opposed acquainted ashamed obliged
  satisfied disappointed amazed astonished delighted exhausted frightened terrified embarrassed confused annoyed alarmed agitated
  amused distressed shocked relieved puzzled startled stunned thrilled troubled upset vexed weary wounded aged beloved blessed cursed
  crowded dated detached devoted disposed distinguished experienced fixed gifted inclined informed limited marked mixed noted
  pointed qualified reserved retired skilled spirited talented tempted united unmarried unused wicked wretched ragged rugged naked crooked learned`
    .split(/\s+/)
    .filter(Boolean),
);

/** Speech tags and the like, which a writer repeats on purpose and readers skip over. */
export const NOT_ECHOES = new Set(
  'said says say asked asks replied answered told looked turned thought knew back down still even again like into only every such most more never other first little much many well long time some must shall upon'.split(' '),
);

/**
 * Adverbs of degree, time and frequency (“nearly”, “lately”, “usually”). They
 * don't prop up a weak verb the way manner adverbs (“ran quickly”) do, so
 * Sally leaves them to the filler list or alone.
 */
export const NOT_MANNER = new Set(
  `nearly hardly scarcely barely merely mainly chiefly partly exactly precisely usually probably possibly presently lately recently
  finally immediately instantly directly rarely seldom formerly previously currently shortly eventually ultimately originally
  equally likewise accordingly mutually only early daily nightly weekly certainly entirely completely mostly generally
  particularly especially apparently evidently presumably obviously clearly surely really actually simply totally literally
  basically definitely truly utterly fairly slightly essentially practically virtually seriously honestly frankly absolutely
  incredibly extremely highly largely suddenly`
    .split(/\s+/)
    .filter(Boolean),
);

const escapeText = (s: string) =>
  s
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/['’]/g, "['’]")
    .replace(/\s+/g, '\\s+');

/**
 * A slot pattern as a regular expression, without anchors: each {a|b} becomes a
 * group (capturing when asked), spaces match any run of spaces, and an
 * apostrophe matches either kind.
 */
export function patternSource(pattern: string, capture = false): string {
  const tidy = pattern.replace(/\s+/g, ' ').trim();
  let out = '';
  let last = 0;
  for (const m of tidy.matchAll(/\{([^{}]*)\}/g)) {
    out += escapeText(tidy.slice(last, m.index));
    out += `(${capture ? '' : '?:'}${m[1]!.split('|').map(escapeText).join('|')})`;
    last = m.index + m[0].length;
  }
  // A dropped word ({out |}) leaves its space behind, so spaces after a slot are optional.
  return (out + escapeText(tidy.slice(last))).replace(/\)\\s\+/g, ')\\s*');
}

/** One expression for a whole list, matching whole words only and ignoring case. */
export function listRegExp(patterns: readonly string[]): RegExp {
  const sources = [...patterns].sort((a, b) => b.length - a.length).map((p) => patternSource(p));
  return new RegExp(`(?<![\\p{L}'’])(?:${sources.join('|')})(?![\\p{L}'’])`, 'giu');
}

/** Each redundancy with its own expression, so a match can find its shorter way. */
const REDUNDANCY_TESTS = REDUNDANCIES.map(([pattern, short]) => ({ test: new RegExp(`^${patternSource(pattern, true)}$`, 'iu'), short }));

/** The shorter way for a phrase the redundancy list matched. */
export function shorterWay(phrase: string): string | undefined {
  for (const { test, short } of REDUNDANCY_TESTS) {
    const m = test.exec(phrase);
    if (!m) continue;
    const picked = m.slice(1).map((x) => x ?? '');
    return short
      .replace(/\$(\d)/g, (_, n: string) => picked[Number(n) - 1] ?? '')
      .replace(/\{([^{}]*)\}/g, (whole, inner: string) => picked.find((p) => inner.split('|').some((c) => c.toLowerCase() === p.toLowerCase())) ?? whole)
      .replace(/\s+/g, ' ')
      .trim();
  }
  return undefined;
}
