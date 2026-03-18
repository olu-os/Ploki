import React from "react";
import { ParsedBlock } from "../types";

interface ScriptBlockProps {
  block: ParsedBlock;
  index: number;
  blocks: ParsedBlock[];
  updateBlocks: (newBlocks: ParsedBlock[] | ((prev: ParsedBlock[]) => ParsedBlock[])) => void;
}

export const ScriptBlock: React.FC<ScriptBlockProps> = ({ block, index, blocks, updateBlocks }) => {
  const updateBlockParsed = (newParsed: any) => {
    // Delete block if empty
    const isEmpty = typeof newParsed === "string"
      ? newParsed.trim() === ""
      : !newParsed.dialogue?.trim() && !newParsed.speaker?.trim();
    if (isEmpty) {
      updateBlocks((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    const newBlocks = [...blocks];
    newBlocks[index] = { ...block, parsed: newParsed };
    updateBlocks(newBlocks);
  };

  return (
    <div key={index} className="group relative">
      <button
        onClick={() => {
          const newBlocks = [...blocks];
          newBlocks.splice(index, 1);
          updateBlocks(newBlocks);
        }}
        className="absolute -right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity p-2 text-xl"
        title="Delete block"
      >
        ×
      </button>
      {block.type === "act_header" && (
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const val = e.currentTarget.innerText.trim();
            if (val !== block.parsed) updateBlockParsed(val);
          }}
          className="uppercase my-2 text-black font-bold text-center underline outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text"
        >
          {block.parsed}
        </div>
      )}
      {block.type === "scene_heading" && (
        <div 
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const val = e.currentTarget.innerText.trim();
            if (val !== block.parsed) updateBlockParsed(val);
          }}
          className="uppercase my-2 text-black font-bold outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text"
        >
          {block.parsed}
        </div>
      )}
      {block.type === "transition" && (
        <div 
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const val = e.currentTarget.innerText.trim();
            if (val !== block.parsed) updateBlockParsed(val);
          }}
          className="uppercase text-right my-2 text-black outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text"
        >
          {block.parsed}
        </div>
      )}
      {block.type === "dialogue_block" && (
        <div className="mt-2 mb-2 w-full flex flex-col items-center">
          <div className="w-3/5">
            <div className="group/line relative uppercase text-black text-center leading-tight">
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const val = e.currentTarget.innerText.trim();
                  if (val !== block.parsed.speaker) {
                    updateBlockParsed({ ...block.parsed, speaker: val });
                  }
                }}
                className="outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text inline-block min-w-[50px]"
              >
                {block.parsed.speaker}
              </div>
              {!block.parsed.parenthetical && (
                <button
                  onClick={() => {
                    updateBlockParsed({ ...block.parsed, parenthetical: "parenthetical" });
                  }}
                  className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 text-stone-400 hover:text-stone-600 transition-opacity text-[10px] font-bold"
                  title="Add parenthetical"
                >(+)</button>
              )}
            </div>
            {block.parsed.parenthetical && (
              <div className="group/line relative text-black italic text-center leading-tight">
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const val = e.currentTarget.innerText.trim().replace(/[()]/g, "");
                    if (val !== block.parsed.parenthetical) {
                      updateBlockParsed({ ...block.parsed, parenthetical: val });
                    }
                  }}
                  className="outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text inline-block min-w-[30px]"
                >
                  ({block.parsed.parenthetical})
                </div>
                <button
                  onClick={() => {
                    const newBlocks = [...blocks];
                    newBlocks[index] = { ...newBlocks[index], parsed: { ...newBlocks[index].parsed, parenthetical: "" } };
                    updateBlocks(newBlocks);
                  }}
                  className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-xs"
                  title="Delete parenthetical"
                >×</button>
              </div>
            )}
            <div className="group/line relative text-black leading-snug">
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const val = e.currentTarget.innerText.trim();
                  if (val !== block.parsed.dialogue) {
                    updateBlockParsed({ ...block.parsed, dialogue: val });
                  }
                }}
                className="outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text block w-full"
              >
                {block.parsed.dialogue}
              </div>
            </div>
          </div>
        </div>
      )}
      {block.type === "action" && (
        <div 
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            const val = e.currentTarget.innerText.trim();
            if (val !== block.parsed) updateBlockParsed(val);
          }}
          className="my-2 text-stone-950 text-justify outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text"
        >
          {block.parsed}
        </div>
      )}
    </div>
  );
};
