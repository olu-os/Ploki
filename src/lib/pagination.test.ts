import { describe, it, expect } from 'vitest';
import { ParsedBlock } from '../types';
import { getBlockLines, paginateBlocks, LINES_PER_PAGE } from './pagination';

describe('getBlockLines', () => {
  it('should return 3 lines for a scene_heading block', () => {
    const block: ParsedBlock = { type: 'scene_heading', parsed: 'INT. KITCHEN DAY', original: '' };
    expect(getBlockLines(block)).toBe(3);
  });

  it('should return 3 lines for a transition block', () => {
    const block: ParsedBlock = { type: 'transition', parsed: 'CUT TO BLACK:', original: '' };
    expect(getBlockLines(block)).toBe(3);
  });

  it('should return 4 lines for an act_header block', () => {
    const block: ParsedBlock = { type: 'act_header', parsed: 'ACT ONE', original: '' };
    expect(getBlockLines(block)).toBe(4);
  });

  it('should return correct lines for a dialogue block without parenthetical', () => {
    const block: ParsedBlock = {
      type: 'dialogue_block',
      parsed: { speaker: 'JOHN', parenthetical: '', dialogue: 'Hi' },
      original: ''
    };
    expect(getBlockLines(block)).toBe(3);
  });

  it('should return correct lines for a dialogue block with parenthetical', () => {
    const block: ParsedBlock = {
      type: 'dialogue_block',
      parsed: { speaker: 'JOHN', parenthetical: 'quietly', dialogue: 'Hello' },
      original: ''
    };
    expect(getBlockLines(block)).toBe(4);
  });

  it('should return 2 lines for a short action block', () => {
    const block: ParsedBlock = { type: 'action', parsed: 'She opens the door.', original: '' };
    expect(getBlockLines(block)).toBe(2);
  });

  it('should return more lines for a long action block exceeding 60 chars', () => {
    const longText = 'A'.repeat(121);
    const block: ParsedBlock = { type: 'action', parsed: longText, original: '' };
    expect(getBlockLines(block)).toBe(Math.ceil(121 / 60) + 1);
  });
});

describe('paginateBlocks', () => {
  it('should return one empty page for an empty block array', () => {
    const pages = paginateBlocks([]);
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toHaveLength(0);
    expect(pages[0].pageNumber).toBe(1);
  });

  it('should fit a few blocks on a single page', () => {
    const blocks: ParsedBlock[] = [
      { type: 'scene_heading', parsed: 'INT. ROOM', original: '' },
      { type: 'action', parsed: 'Something happens.', original: '' }
    ];
    const pages = paginateBlocks(blocks);
    expect(pages).toHaveLength(1);
    expect(pages[0].blocks).toHaveLength(2);
  });

  it('should split blocks across multiple pages when they exceed LINES_PER_PAGE', () => {
    const actionBlock: ParsedBlock = { type: 'action', parsed: 'Something.', original: '' };
    const blockCount = 25;
    const blocks = Array.from({ length: blockCount }, () => ({ ...actionBlock }));
    const pages = paginateBlocks(blocks);
    expect(pages.length).toBeGreaterThan(1);
    const totalBlocks = pages.reduce((sum, p) => sum + p.blocks.length, 0);
    expect(totalBlocks).toBe(blockCount);
  });

  it('should assign correct incremental page numbers', () => {
    const actionBlock: ParsedBlock = { type: 'action', parsed: 'Something.', original: '' };
    const blocks = Array.from({ length: 25 }, () => ({ ...actionBlock }));
    const pages = paginateBlocks(blocks);
    pages.forEach((page, i) => {
      expect(page.pageNumber).toBe(i + 1);
    });
  });

  it('should preserve original block indices', () => {
    const blocks: ParsedBlock[] = [
      { type: 'action', parsed: 'First.', original: '' },
      { type: 'action', parsed: 'Second.', original: '' },
      { type: 'action', parsed: 'Third.', original: '' }
    ];
    const pages = paginateBlocks(blocks);
    const allEntries = pages.flatMap(p => p.blocks);
    allEntries.forEach((entry, i) => {
      expect(entry.index).toBe(i);
    });
  });

  it('should export LINES_PER_PAGE as 45', () => {
    expect(LINES_PER_PAGE).toBe(45);
  });
});
