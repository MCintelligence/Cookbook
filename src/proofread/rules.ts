import { type Issue, ignoreKey } from './check';
import { OPT_IN_RULES, PETE_RULES } from './pete';
import { STYLE_RULES } from './style';

/**
 * The checks the writer can switch on and off, by group. Harper has hundreds
 * of rules, so they are switched as two groups: its grammar, and its own
 * style suggestions.
 */
export const RULE_GROUPS: { title: string; rules: { id: string; label: string }[] }[] = [
  {
    title: 'Spelling',
    rules: [
      { id: 'spelling', label: 'Misspellings' },
      { id: 'name', label: 'Near misses of story names' },
    ],
  },
  {
    title: 'Grammar',
    rules: [
      { id: 'grammar', label: 'Grammar and punctuation' },
      { id: 'unclosed-quote', label: 'Unclosed quotes' },
      { id: 'stray-capitals', label: 'Capitals in the wrong place' },
      ...PETE_RULES,
    ],
  },
  { title: 'Style', rules: [{ id: 'harper-style', label: 'Word choice and wordiness' }, ...STYLE_RULES.map(({ id, label }) => ({ id, label }))] },
];

const OURS = new Set(RULE_GROUPS.flatMap((g) => g.rules.map((r) => r.id)));

/** Which switch an issue answers to. */
export function ruleGroup(issue: Pick<Issue, 'kind' | 'rule'>): string {
  if (OURS.has(issue.rule)) return issue.rule;
  return issue.kind === 'grammar' ? 'grammar' : 'harper-style';
}

const CONTEXT = 24;

/** Ignoring just this once remembers the words around it too, so the same thing elsewhere still shows. */
export function onceKey(issue: Issue, text: string): string {
  const around = `${text.slice(Math.max(0, issue.from - CONTEXT), issue.from)}|${text.slice(issue.to, issue.to + CONTEXT)}`;
  return `${ignoreKey(issue, text.slice(issue.from, issue.to))}#${around}`;
}

export interface Hiding {
  /** Ignore keys (see ignoreKey and onceKey). */
  ignored: Set<string>;
  /** Rule groups switched off (see ruleGroup). */
  off: Set<string>;
}

export interface IssueKeys {
  key: string;
  once: string;
  group: string;
}

export function keysOf(issue: Issue, text: string): IssueKeys {
  return { key: ignoreKey(issue, text.slice(issue.from, issue.to)), once: onceKey(issue, text), group: ruleGroup(issue) };
}

export const isHidden = (keys: IssueKeys, hiding: Hiding) => hiding.off.has(keys.group) || hiding.ignored.has(keys.key) || hiding.ignored.has(keys.once);

/**
 * The rule groups switched off, from what book.json keeps. A check that starts off (see
 * OPT_IN_RULES) is kept there as "+rule" once the writer turns it on, so a recipe saved before
 * the check existed doesn't get it switched on by surprise.
 */
export function effectiveOff(stored: readonly string[]): string[] {
  const off = stored.filter((r) => !r.startsWith('+'));
  for (const rule of OPT_IN_RULES) if (!stored.includes(`+${rule}`) && !off.includes(rule)) off.push(rule);
  return off;
}

/** What book.json keeps after the writer switches a rule on or off. */
export function storedOff(stored: readonly string[], rule: string, on: boolean): string[] {
  if (OPT_IN_RULES.includes(rule)) {
    const rest = stored.filter((r) => r !== rule && r !== `+${rule}`);
    return on ? [...rest, `+${rule}`] : rest;
  }
  return on ? stored.filter((r) => r !== rule) : [...new Set([...stored, rule])];
}
