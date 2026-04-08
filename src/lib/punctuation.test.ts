import { describe, it, expect } from 'vitest';
import { replaceSpokenPunctuation } from './punctuation';

describe('replaceSpokenPunctuation', () => {
  it('should remove punctuation adjacent to parentheses', () => {
    expect(replaceSpokenPunctuation('hello, (there)', false)).toBe('hello (there)');
    expect(replaceSpokenPunctuation('world (today).', false)).toBe('world (today)');
  });

  it('should replace spoken punctuation words with symbols', () => {
    expect(replaceSpokenPunctuation('hello comma world period', false)).toBe('hello, world.');
  });

  it('should replace "dot dot dot" and "ellipsis" with ...', () => {
    expect(replaceSpokenPunctuation('pause dot dot dot here', false)).toBe('pause... here');
    expect(replaceSpokenPunctuation('he said ellipsis I cannot', false)).toBe('he said... I cannot');
  });

  it('should replace "dash dash" and "dash" with the correct symbols', () => {
    expect(replaceSpokenPunctuation('dash dash', false)).toBe('- -');
    expect(replaceSpokenPunctuation('it was dash interesting', false)).toBe('it was - interesting');
  });

  it('should capitalize the first letter when capitalize=true (default)', () => {
    expect(replaceSpokenPunctuation('hello world')).toBe('Hello world');
  });

  it('should not capitalize the first letter when capitalize=false', () => {
    expect(replaceSpokenPunctuation('hello world', false)).toBe('hello world');
  });

  it('should capitalize word after sentence-ending punctuation', () => {
    expect(replaceSpokenPunctuation('hello. goodbye')).toBe('Hello. Goodbye');
  });

  it('should collapse extra spaces', () => {
    expect(replaceSpokenPunctuation('hello   world', false)).toBe('hello world');
  });

  it('should return empty string for empty input', () => {
    expect(replaceSpokenPunctuation('')).toBe('');
  });

  it('should replace open/close parenthesis spoken words', () => {
    expect(replaceSpokenPunctuation('para hello para', false)).toBe('(hello)');
    expect(replaceSpokenPunctuation('open parenthesis world close parenthesis', false)).toBe('(world)');
  });
});
