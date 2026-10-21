/**
 * Character ranges of dialogue in one paragraph, quote marks included.
 *
 * Curly quotes pair up as written. A straight " opens after a space, an
 * opening bracket or a dash, and closes anywhere else. Speech that runs past
 * the end of the paragraph (the usual style for a long speech over several
 * paragraphs) counts to the end of it. Single quotes are left alone, because
 * in English they are mostly apostrophes.
 */
export function dialogueRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '“' && open === -1) open = i;
    else if (ch === '”' && open !== -1) {
      out.push([open, i + 1]);
      open = -1;
    } else if (ch === '"') {
      const prev = i > 0 ? text[i - 1]! : ' ';
      if (open === -1 && /[\s([{—–-]/.test(prev)) open = i;
      else if (open !== -1) {
        out.push([open, i + 1]);
        open = -1;
      }
    }
  }
  if (open !== -1) out.push([open, text.length]);
  return out;
}
