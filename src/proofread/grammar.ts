import { type Lint, type LintKind, type LocalLinter, SuggestionKind } from 'harper.js';
import { type Dialect, type Issue, type IssueKind } from './check';

/**
 * Grammar from Harper, which runs on the device as WebAssembly. Spelling is
 * left to Hunspell (see check.ts), so Harper's own spelling rules are off.
 */
// Unclosed quotes are Pete's own check (style.ts), which can offer the closing quote.
// OrthographicConsistency turns names such as Sam into acronyms (SAM).
export const OFF_RULES = ['SpellCheck', 'Misspell', 'UnclosedQuotes', 'OrthographicConsistency'];

/** Harper's kinds of lint that read as style advice rather than mistakes. */
const STYLE_KINDS = new Set<LintKind>(['Style', 'Readability', 'Enhancement', 'Redundancy']);
/** Already covered by the spelling check. */
const SKIP_KINDS = new Set<LintKind>(['Spelling', 'Typo']);

export const HARPER_DIALECT: Record<Dialect, number> = { 'en-US': 0, 'en-GB': 1 };

/** Harper writes code in backticks; on a writer's card it reads better in quotes. */
export const quoteTicks = (s: string) => s.replace(/`([^`]*)`/g, '“$1”');

/** Each suggestion as the text that replaces the whole problem. */
function replacement(lint: Lint, problem: string): string[] {
  return lint.suggestions().map((s) => {
    const kind = s.kind();
    if (kind === SuggestionKind.Remove) return '';
    if (kind === SuggestionKind.InsertAfter) return problem + s.get_replacement_text();
    return s.get_replacement_text();
  });
}

export function lintsToIssues(text: string, organized: Record<string, Lint[]>, why: Record<string, string>): Issue[] {
  const issues: Issue[] = [];
  for (const [rule, lints] of Object.entries(organized)) {
    if (OFF_RULES.includes(rule)) continue;
    for (const lint of lints) {
      const kind = lint.lint_kind() as LintKind;
      if (SKIP_KINDS.has(kind)) continue;
      // harper.js gives positions in JavaScript's own UTF-16 units.
      const { start: from, end: to } = lint.span();
      if (to <= from || to > text.length) continue;
      const problem = text.slice(from, to);
      const issueKind: IssueKind = STYLE_KINDS.has(kind) ? 'style' : 'grammar';
      issues.push({
        from,
        to,
        kind: issueKind,
        rule,
        message: quoteTicks(lint.message()),
        suggestions: [...new Set(replacement(lint, problem))].filter((s) => s !== problem).slice(0, 4),
        ...(why[rule] && { why: quoteTicks(why[rule]) }),
      });
    }
  }
  return issues.sort((a, b) => a.from - b.from);
}

/** Grammar issues in each text, leaving out any that overlap a spelling issue. */
export async function grammarIssues(linter: LocalLinter, texts: string[], spelling: Issue[][], why: Record<string, string>): Promise<Issue[][]> {
  const out: Issue[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!;
    const organized = await linter.organizedLints(text, { language: 'plaintext' });
    const taken = spelling[i] ?? [];
    out.push(lintsToIssues(text, organized, why).filter((g) => !taken.some((s) => g.from < s.to && g.to > s.from)));
  }
  return out;
}

/** A linter set up for Cookbook: our dialect, our words, Harper's spelling off. */
export async function setUpLinter(linter: LocalLinter, dialect: Dialect, words: string[]): Promise<void> {
  await linter.setup();
  await linter.setDialect(HARPER_DIALECT[dialect]);
  const config = await linter.getLintConfig();
  for (const rule of OFF_RULES) if (rule in config) config[rule] = false;
  await linter.setLintConfig(config);
  await linter.clearWords();
  if (words.length > 0) await linter.importWords(words);
}
