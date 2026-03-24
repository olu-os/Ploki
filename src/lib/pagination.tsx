import React from "react";
import { ParsedBlock } from "../types";

export const LINES_PER_PAGE = 45;

export function getBlockLines(block: ParsedBlock): number {
  if (block.type === "scene_heading") return 3; // 1 for text + 2 for spacing
  if (block.type === "transition") return 3;
  if (block.type === "act_header") return 4; // centered bold underlined, extra spacing
  if (block.type === "dialogue_block") {
    let lines = 1; // Speaker
    if (block.parsed.parenthetical) lines += 1;
    // Estimate dialogue lines (approx 35 chars per line in dialogue width)
    const dialogueLines = Math.ceil(block.parsed.dialogue.length / 35) || 1;
    return lines + dialogueLines + 1; // +1 for bottom margin
  }
  // Action: approx 60 chars per line
  const actionLines = Math.ceil((block.parsed as string).length / 60) || 1;
  return actionLines + 1; // +1 for bottom margin
}

export function paginateBlocks(blocks: ParsedBlock[]): { blocks: { block: ParsedBlock, index: number }[], pageNumber: number }[] {
  const pages: { blocks: { block: ParsedBlock, index: number }[], pageNumber: number }[] = [];
  let currentPage: { block: ParsedBlock, index: number }[] = [];
  let currentLines = 0;

  blocks.forEach((block, index) => {
    const blockLines = getBlockLines(block);
    if (currentLines + blockLines > LINES_PER_PAGE && currentPage.length > 0) {
      pages.push({ blocks: currentPage, pageNumber: pages.length + 1 });
      currentPage = [];
      currentLines = 0;
    }
    currentPage.push({ block, index });
    currentLines += blockLines;
  });

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push({ blocks: currentPage, pageNumber: pages.length + 1 });
  }

  return pages;
}

export const Page: React.FC<{ pageNumber: number; children?: React.ReactNode }> = ({ children, pageNumber }) => (
  <div className="relative w-full max-w-[8.5in] min-h-[11in] bg-white shadow-lg mb-4 md:mb-8 px-12 py-12 md:pl-[1.5in] md:pr-[1in] md:pt-[1in] md:pb-[1in] font-mono text-[12pt] leading-[1.2] text-black overflow-visible flex flex-col">
    <div className="absolute top-6 right-4 md:top-[0.5in] md:right-[1in] text-right">
      {pageNumber}.
    </div>
    <div className="flex-1">
      {children}
    </div>
  </div>
);
