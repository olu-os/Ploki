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

  it('should parse natural scene headings (interior/exterior/int./ext.)', () => {
    const result = parseNLP('interior kitchen day', [], null);
    expect(result.type).toBe('scene_heading');
    expect(result.parsed).toBe('INT. KITCHEN DAY');

    const result2 = parseNLP('ext. park night', [], null);
    expect(result2.type).toBe('scene_heading');
    expect(result2.parsed).toBe('EXT. PARK NIGHT');
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

  it('should parse natural act headers (act 2, act three)', () => {
    const result = parseNLP('act 2', [], null);
    expect(result.type).toBe('act_header');
    expect(result.parsed).toBe('ACT 2');

    const result2 = parseNLP('act three', [], null);
    expect(result2.type).toBe('act_header');
    expect(result2.parsed).toBe('ACT THREE');
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
      parenthetical: 'whispering',
      dialogue: 'I am secretly a spy'
    });
  });

  it('should detect continued dialogue (CONT\'D)', () => {
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

  it('should title-case a character name in action text', () => {
    const result = parseNLP('emilio walks into the room', mockCharacters, null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('Emilio walks into the room');
  });

  it('should title-case a character name mid-sentence in action text', () => {
    const result = parseNLP('the door opens and emilio enters', mockCharacters, null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('The door opens and Emilio enters');
  });

  it('should title-case multiple character names in action text', () => {
    const result = parseNLP('emilio looks at cassandra', mockCharacters, null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('Emilio looks at Cassandra');
  });

  it('should title-case a character name when referred to by alias in action text', () => {
    const result = parseNLP('cass stares at the wall', mockCharacters, null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('Cassandra stares at the wall');
  });

  it('should title-case each word of a multi-word character name in action text', () => {
    const multiWordChars: Character[] = [
      { id: '3', user_id: '1', canonical_name: 'MARY JANE', aliases: '' }
    ];
    const result = parseNLP('mary jane runs down the hall', multiWordChars, null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('Mary Jane runs down the hall');
  });

  it('should parse as an action if there are over two words before the action verb', () => {
    const result = parseNLP('the clock outside  says it is 9pm', mockCharacters, null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('The clock outside says it is 9pm');
  });

  it('should handle dialogue with just a period after the verb', () => {
    const result = parseNLP('Emilio says.', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed).toEqual({
      speaker: 'EMILIO',
      parenthetical: '',
      dialogue: ''
    });
  });

  it('should return isContinued=false when lastSpeaker differs', () => {
    const result = parseNLP('Emilio continued I have more to say', mockCharacters, 'CASSANDRA');
    expect(result.isContinued).toBe(false);
  });

  it('should handle "goes on" as a continued dialogue verb', () => {
    const result = parseNLP('Emilio goes on and on', mockCharacters, 'EMILIO');
    expect(result.type).toBe('dialogue_block');
    expect(result.isContinued).toBe(true);
  });

  it('should handle "fade out" as a transition', () => {
    const result = parseNLP('fade out', [], null);
    expect(result.type).toBe('transition');
    expect(result.parsed).toBe('FADE OUT:');
  });

  it('should handle "act header:" keyword form', () => {
    const result = parseNLP('act header: prologue', [], null);
    expect(result.type).toBe('act_header');
    expect(result.parsed).toBe('PROLOGUE');
  });

  it('should handle "slugline" as a scene heading', () => {
    const result = parseNLP('slugline ext. rooftop night', [], null);
    expect(result.type).toBe('scene_heading');
    expect(result.parsed).toBe('EXT. ROOFTOP NIGHT');
  });

  it('should handle inline parenthetical inside dialogue string', () => {
    const result = parseNLP('Emilio says I am fine (nervously) trust me', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed.parenthetical).toBe('nervously');
    expect(result.parsed.dialogue).toBe('I am fine trust me');
  });

  it('should preserve punctuation in action lines', () => {
    const result = parseNLP('She opens the door. It creaks.', [], null);
    expect(result.type).toBe('action');
    expect(result.parsed).toBe('She opens the door. It creaks.');
  });

  it('should handle empty string input as action', () => {
    const result = parseNLP('', [], null);
    expect(result.type).toBe('action');
  });

  it('should handle dialogue spoken with "whispers"', () => {
    const result = parseNLP('Emilio whispers keep it down', mockCharacters, null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed.speaker).toBe('EMILIO');
    expect(result.parsed.dialogue).toBe('Keep it down');
  });

  it('should uppercase an unknown speaker name', () => {
    const result = parseNLP('John says hello', [], null);
    expect(result.type).toBe('dialogue_block');
    expect(result.parsed.speaker).toBe('JOHN');
    expect(result.parsed.dialogue).toBe('Hello');
  });

  it('should preserve the original text in result.original', () => {
    const text = 'She walks slowly.';
    const result = parseNLP(text, [], null);
    expect(result.original).toBe(text);
  });
});
