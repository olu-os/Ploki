import { describe, it, expect } from 'vitest';
import { parseNLP } from './parseNLP';
import { Character } from '../types';

describe('parseNLP', () => {
  const mockCharacters: Character[] = [
    { id: '1', user_id: '1', canonical_name: 'EMILIO', aliases: 'Em, E' },
    { id: '2', user_id: '1', canonical_name: 'CASSANDRA', aliases: 'Cass' }
  ];

  it('should parse scene headings correctly', () => {
    const result = parseNLP('scene heading interior kitchen day', [], null);
    expect(result.type).toBe('scene_heading');
    expect(result.parsed).toBe('INT. KITCHEN DAY');

    const result2 = parseNLP('new seen exterior park evening', [], null);
    expect(result2.type).toBe('scene_heading');
    expect(result2.parsed).toBe('EXT. PARK EVENING');
  });

  it('should parse transitions correctly', () => {
    const result = parseNLP('cut to black', [], null);
    expect(result.type).toBe('transition');
    expect(result.parsed).toBe('CUT TO BLACK:');
  });

  it('should parse act headers correctly', () => {
    const result = parseNLP('act one', [], null);
    expect(result.type).toBe('act_header');
    expect(result.parsed).toBe('ACT ONE');
  });

  it('should parse dialogue with speaker and action', () => {
    const result = parseNLP('Emilio says hello there', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed).toEqual({
      speaker: 'EMILIO',
      parenthetical: '',
      dialogue: 'Hello there'
    });
  });

  it('should handle aliases in dialogue', () => {
    const result = parseNLP('Cass says I am here', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed.speaker).toBe('CASSANDRA');
  });

  it('should handle parentheticals (para keyword)', () => {
    const result = parseNLP('Emilio says para whispering para I am secretly a spy', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed).toEqual({
      speaker: 'EMILIO',
      parenthetical: 'whispering',
      dialogue: 'I am secretly a spy'
    });
  });

  it('should handle parentheticals (power and para keywords)', () => {
    const result = parseNLP('Emilio says para whispering power I am secretly a spy', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed).toEqual({
      speaker: 'EMILIO',
      parenthetical: 'whispering',
      dialogue: 'I am secretly a spy'
    });
  });

  it('should handle parentheticals before action verb', () => {
    const result = parseNLP('Emilio para whispering para says I am secretly a spy', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed).toEqual({
      speaker: 'EMILIO',
      parenthetical: 'whispering',
      dialogue: 'I am secretly a spy'
    });
  });

  it('should handle parentheticals in unusual places', () => {
    const result = parseNLP('Emilio says I am secretly para whispering para a spy', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed).toEqual({
      speaker: 'EMILIO',
      parenthetical: '',
      dialogue: 'I am secretly a spy'
    });
  });

  it('should detect continued dialogue (CONT\'D)', () => {
    // Emilio spoke last
    const result = parseNLP('Emilio continued I have more to say', mockCharacters, 'EMILIO');
    expect(result.type).toBe('dialogue_block');
    expect(result.isContinued).toBe(true);
    expect(result.parsed.speaker).toBe('EMILIO');
  });

  it('should default to action if no other pattern matches', () => {
    const result = parseNLP('The wind blows through the trees.', [], null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('The wind blows through the trees.');
  });
});
