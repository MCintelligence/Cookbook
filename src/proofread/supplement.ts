/**
 * Words Hunspell's lists don't have yet but writers use every day: the
 * kitchen (Cookbook is named for it), the phone in every character's
 * pocket, and what people say out loud. Each is added to the dictionary
 * when it loads. "word/model" takes the endings of the model, so
 * "livestream/stream" brings "livestreamed" and "livestreaming" with it.
 *
 * Accented words (café, naïve, fiancée) need no entry: a word is right
 * when it is right without its accents (see isCorrect in check.ts).
 */
export const SUPPLEMENT: readonly string[] = `
wifi Wi-Fi livestream/stream livestreamer/streamer vlog/blog vlogger/blogger podcaster/broadcaster
unfollow/follow influencer/teacher onesie/movie photobomb/bomb facetime/time skype/type webpage/page
bluetooth rideshare/share ebook/book audiobook/book airfryer/fryer smartwatch/watch
mandoline sous-vide za'atar macchiato frappuccino matcha chai kombucha tahini falafel/apple halloumi
burrata mascarpone pancetta chorizo focaccia panini kimchi gochujang miso tempeh ramen udon soba
sashimi pho bibimbap wonton/button bao gyoza roti paneer tikka masala biryani dal dhal fenugreek garam
harissa shakshuka tagine/machine bulgur ganoush chipotle/hotel churro/hero aioli arancini panna cotta
gelato affogato brulee chiffonade bechamel hollandaise beurre ganache macaron/button madeleine/machine
choux panko charcuterie umami brined
hygge feng shui sudoku deja vu
leant curtsey/survey natured naturedly hearted
there're she'd've they'd've who'd've he'd've we'd've you'd've
argh aargh ugh hmm hmmm mmm shh shhh ahh aah ooh yay oof ew eww tsk woah gah heh hah haha hahaha lol omg
`
  .trim()
  .split(/\s+/);

/** Each entry as a word and the model its endings come from. */
export function supplementEntries(): [string, string | undefined][] {
  return SUPPLEMENT.map((entry) => {
    const [word, model] = entry.split('/');
    return [word!, model];
  });
}
