import { describe, expect, it } from 'vitest';
import { type Issue } from './check';
import { effectiveOff, isHidden, keysOf, ruleGroup, storedOff } from './rules';

const at = (text: string, part: string, kind: Issue['kind'], rule: string): Issue => {
  const from = text.indexOf(part);
  return { from, to: from + part.length, kind, rule, message: '', suggestions: [] };
};

describe('proofreader switches', () => {
  it('groups Harper’s rules and keeps our own', () => {
    expect(ruleGroup({ kind: 'spelling', rule: 'spelling' })).toBe('spelling');
    expect(ruleGroup({ kind: 'style', rule: 'adverb' })).toBe('adverb');
    expect(ruleGroup({ kind: 'grammar', rule: 'AnA' })).toBe('grammar');
    expect(ruleGroup({ kind: 'style', rule: 'VeryUnique' })).toBe('harper-style');
  });

  it('ignores once by the words around it, and always by rule and text', () => {
    const text = 'Ate a apple. Ate a orange.';
    const one = keysOf(at(text, 'a apple', 'grammar', 'AnA'), text);
    const hiding = { ignored: new Set([one.once]), off: new Set<string>() };
    expect(isHidden(one, hiding)).toBe(true);
    const other = keysOf({ ...at(text, 'a orange', 'grammar', 'AnA'), to: text.indexOf('a orange') + 1 }, text);
    expect(isHidden(other, hiding)).toBe(false);
    expect(isHidden(other, { ignored: new Set(['AnA:a']), off: new Set() })).toBe(true);
    expect(isHidden(other, { ignored: new Set(), off: new Set(['grammar']) })).toBe(true);
  });

  it('starts run-ons off, and keeps a writer’s choice either way', () => {
    expect(effectiveOff([])).toEqual(['run-on']);
    expect(effectiveOff(['adverb'])).toEqual(['adverb', 'run-on']);
    const on = storedOff([], 'run-on', true);
    expect(on).toEqual(['+run-on']);
    expect(effectiveOff(on)).toEqual([]);
    expect(storedOff(on, 'run-on', false)).toEqual([]);
    expect(storedOff(['adverb'], 'adverb', true)).toEqual([]);
    expect(storedOff([], 'echo', false)).toEqual(['echo']);
  });
});
