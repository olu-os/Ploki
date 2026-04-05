import React, { useState, useEffect, useRef } from "react";
import { Mic, Plus } from "lucide-react";

interface InsertionBarProps {
  index: number;
  onInsert: (index: number, type: "action" | "scene_heading" | "transition" | "dialogue_block" | "act_header", template: any) => void;
  onStartDictation: (index: number) => void;
  isListeningAtThisIndex: boolean;
  accumulatedTranscript: string;
  transcript: string;
  onAccumulatedTranscriptChange: (text: string) => void;
}

export const InsertionBar: React.FC<InsertionBarProps> = ({
  index,
  onInsert,
  onStartDictation,
  isListeningAtThisIndex,
  accumulatedTranscript,
  transcript,
  onAccumulatedTranscriptChange,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`group/bar relative flex flex-col transition-all duration-200 ${showMenu ? 'z-50' : 'z-10'} ${
      isListeningAtThisIndex ? "my-8" : "-my-3"
    }`}>
      {/* Bar row — line, plus, and mic always share this h-6 row so they stay aligned */}
      <div className="relative flex items-center h-6">
        <div className={`w-full h-[1px] bg-stone-200 transition-opacity ${showMenu || isListeningAtThisIndex ? 'opacity-100' : 'opacity-0 group-hover/bar:opacity-100'}`} />

      <div className={`absolute -left-6 flex items-center transition-opacity ${showMenu || isListeningAtThisIndex ? 'opacity-100' : 'opacity-0 group-hover/bar:opacity-100'}`} ref={menuRef}>
        <button 
          onClick={() => setShowMenu(!showMenu)}
          className="bg-white border border-stone-200 rounded-full shadow-sm hover:bg-stone-50 text-stone-400 hover:text-stone-600"
        >
          <Plus size={14} />
        </button>
        
        {showMenu && (
          <>
            <div className="fixed inset-0 bg-transparent cursor-default" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
            <div className="absolute left-8 top-0 bg-white border border-stone-200 rounded shadow-lg py-1 w-40 z-20">
            <button 
              onClick={() => { onInsert(index, "scene_heading", "INT. [LOCATION] - DAY"); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50"
            >
              Scene Heading
            </button>
            <button 
              onClick={() => { onInsert(index, "action", "Action"); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50"
            >
              Action
            </button>
            <button 
              onClick={() => { onInsert(index, "dialogue_block", { speaker: "CHARACTER", dialogue: "[Dialogue]", parenthetical: "" }); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50"
            >
              Dialogue
            </button>
            <button 
              onClick={() => { onInsert(index, "transition", "CUT TO:"); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50"
            >
              Transition
            </button>
            <button 
              onClick={() => { onInsert(index, "act_header", "ACT ONE"); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50"
            >
              Act Header
            </button>
          </div>
        </>
      )}
      </div>

        <div className={`absolute -right-6 transition-opacity ${isListeningAtThisIndex ? 'opacity-100' : 'opacity-0 group-hover/bar:opacity-100'}`}>
          <button 
            onClick={() => onStartDictation(index)}
            className={` rounded-full shadow-sm border transition-colors ${
              isListeningAtThisIndex 
              ? "bg-red-50 border-red-200 text-red-500" 
              : "bg-white border-stone-200 text-stone-400 hover:text-stone-600 hover:bg-stone-50"
            }`}
          >
            <Mic size={14} />
          </button>
        </div>
      </div>{/* end bar row */}

      {isListeningAtThisIndex && (
        <div className="w-full py-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <span className="relative flex h-2 w-2 shrink-0 mt-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <textarea
                value={accumulatedTranscript}
                onChange={(e) => onAccumulatedTranscriptChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onStartDictation(index);
                  }
                }}
                placeholder="Listening..."
                className="text-black font-mono text-[12pt] bg-transparent border-none focus:ring-0 outline-none w-full p-0 resize-none overflow-hidden min-h-[1.5em] leading-relaxed"
                autoFocus
                rows={1}
                ref={(el) => {
                  if (el) {
                    el.style.height = '0px';
                    el.style.height = el.scrollHeight + 'px';
                  }
                }}
              />
            </div>
            {transcript && <div className="text-stone-400 font-mono text-[10pt] italic ml-5 whitespace-pre-wrap break-words leading-relaxed">{transcript}</div>}
          </div>
        </div>
      )}
    </div>
  );
};
