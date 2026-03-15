import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Save, FileText, Settings, Users, Plus, Play, Pause, Download, Undo, Redo, LogOut } from "lucide-react";
import { motion } from "motion/react";
import jsPDF from "jspdf";
import { Project, Character, ParsedBlock } from "./types";
import { supabase } from "./lib/supabase";

// CONT’D logic: pass lastSpeaker and set isContinued if needed
function parseNLP(text: string, characters: Character[], lastSpeaker: string | null): ParsedBlock & { isContinued?: boolean } {
  let parsedText: any = text;
  let type: ParsedBlock["type"] = "action";
  let isContinued = false;
  const lowerText = text.toLowerCase();
  const sceneHeadingMatch = text.match(/^scene heading:?:?\s*(.+)/i);
  if (sceneHeadingMatch) {
    type = "scene_heading";
    parsedText = sceneHeadingMatch[1].trim().toUpperCase();
    parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
  } else if (lowerText.startsWith("new scene")) {
    type = "scene_heading";
    parsedText = text.replace(/^new scene,?\s*/i, "").toUpperCase();
    parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
  } else if (lowerText.startsWith("cut to") || lowerText.startsWith("fade out")) {
    type = "transition";
    parsedText = text.toUpperCase() + ":";
  } else {
    // Dialogue: "Will says ..." or "Will quietly says ..."
    const dialogueMatch = text.match(/^([\w\s]+?)\s+(?:(\w+)\s+)?(says|asks|yells|whispers|replies|responds|queries)(?:\s+(.+))?$/i);
    if (dialogueMatch) {
      let speaker = dialogueMatch[1].trim();
      const adverb = dialogueMatch[2] ? dialogueMatch[2].toLowerCase() : "";
      const action = dialogueMatch[3].toLowerCase();
      let dialogue = dialogueMatch[4] ? dialogueMatch[4].trim() : "";
      dialogue = dialogue.replace(/^['"]|['"]$/g, "");
      // CONT’D detection: if dialogue starts with "goes on" or "continues"
      const contdMatch = dialogue.match(/^(goes on|continues)[,.\s]+(.*)$/i);
      let isContd = false;
      if (contdMatch && lastSpeaker && speaker.toUpperCase() === lastSpeaker.toUpperCase()) {
        isContd = true;
        dialogue = contdMatch[2].trim();
      }
      // Alias lookup
      const charMatch = characters.find(c =>
        c.canonical_name.toLowerCase() === speaker.toLowerCase() ||
        (c.aliases && c.aliases.toLowerCase().split(',').map(a => a.trim()).includes(speaker.toLowerCase()))
      );
      if (charMatch) {
        speaker = charMatch.canonical_name;
      } else {
        speaker = speaker.toUpperCase();
      }
      type = "dialogue_block";
      let parenthetical = "";

      const paraMatch = dialogue.match(/^(?:para|power|parenthetical)\s+(.+?)\s+(?:para|power|parenthetical)\s+(.*)$/i);
      if (paraMatch) {
        if (!parenthetical) parenthetical = paraMatch[1].trim();
        dialogue = paraMatch[2].trim();
      }
      // Inline parenthetical extraction
      const inlineParenMatch = dialogue.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
      if (inlineParenMatch) {
        const beforeParen = inlineParenMatch[1].trim();
        const parenContent = inlineParenMatch[2].trim();
        const afterParen = inlineParenMatch[3].trim();
        dialogue = (beforeParen + (afterParen ? " " + afterParen : "")).trim();
        if (!parenthetical) {
          parenthetical = parenContent;
        }
      }
      // Capitalize first letter of dialogue
      if (dialogue) dialogue = dialogue.charAt(0).toUpperCase() + dialogue.slice(1);
      parsedText = { speaker, parenthetical, dialogue };
      isContinued = isContd;
    } else {
      // Action: capitalize first letter
      type = "action";
      parsedText = text.charAt(0).toUpperCase() + text.slice(1);
    }
  }
  return { type, parsed: parsedText, original: text, isContinued };
}


const InsertionBar = ({ 
  index, 
  onInsert, 
  onStartDictation, 
  isListeningAtThisIndex,
  accumulatedTranscript,
  transcript,
  secondsLeft,
  onHoverChange
}: { 
  index: number, 
  onInsert: (index: number, type: string, template: any) => void,
  onStartDictation: (index: number) => void,
  isListeningAtThisIndex: boolean,
  accumulatedTranscript: string,
  transcript: string,
  secondsLeft: number,
  onHoverChange?: (index: number | null) => void
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
    <div className="group/bar relative h-6 flex flex-col items-center justify-center -my-3 z-10" onMouseEnter={() => onHoverChange?.(index)} onMouseLeave={() => onHoverChange?.(null)}>
      <div className="w-full h-[1px] bg-stone-200 opacity-0 group-hover/bar:opacity-100 transition-opacity" />
      
      <div className="absolute -left-8 opacity-0 group-hover/bar:opacity-100 transition-opacity flex items-center" ref={menuRef}>
        <button 
          onClick={() => setShowMenu(!showMenu)}
          className="p-1 bg-white border border-stone-200 rounded-full shadow-sm hover:bg-stone-50 text-stone-400 hover:text-stone-600"
        >
          <Plus size={14} />
        </button>
        
        {showMenu && (
          <div className="absolute left-8 top-0 bg-white border border-stone-200 rounded shadow-lg py-1 w-40 z-20">
            <button 
              onClick={() => { onInsert(index, "scene_heading", "INT. [LOCATION] - DAY"); setShowMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50"
            >
              Scene Heading
            </button>
            <button 
              onClick={() => { onInsert(index, "action", "[Action description]"); setShowMenu(false); }}
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
          </div>
        )}
      </div>

      {isListeningAtThisIndex && (
        <div className="absolute top-6 w-full flex justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm border border-emerald-100 shadow-lg rounded-lg px-4 py-2 flex items-center gap-3 z-50 max-w-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-stone-800 text-xs font-medium">{accumulatedTranscript || "Listening..."}</span>
                {secondsLeft > 0 && (
                  <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-sans">
                    {secondsLeft}s
                  </span>
                )}
              </div>
              {transcript && <span className="text-stone-400 text-[10px] italic">{transcript}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="absolute -right-8 opacity-0 group-hover/bar:opacity-100 transition-opacity">
        <button 
          onClick={() => onStartDictation(index)}
          className={`p-1 rounded-full shadow-sm border transition-colors ${
            isListeningAtThisIndex 
            ? "bg-red-50 border-red-200 text-red-500" 
            : "bg-white border-stone-200 text-stone-400 hover:text-stone-600 hover:bg-stone-50"
          }`}
        >
          <Mic size={14} />
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [accumulatedTranscript, setAccumulatedTranscript] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const silenceTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const accumulatedTextRef = useRef("");
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [history, setHistory] = useState<ParsedBlock[][]>([]);
  const [future, setFuture] = useState<ParsedBlock[][]>([]);

  const updateBlocks = (newBlocks: ParsedBlock[] | ((prev: ParsedBlock[]) => ParsedBlock[])) => {
    setBlocks(prev => {
      const next = typeof newBlocks === 'function' ? newBlocks(prev) : newBlocks;
      setHistory(h => [...h.slice(-49), prev]);
      setFuture([]);
      return next;
    });
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(f => [blocks, ...f]);
    setHistory(h => h.slice(0, -1));
    setBlocks(previous);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, blocks]);
    setFuture(f => f.slice(1));
    setBlocks(next);
  };

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          redoRef.current();
        } else {
          e.preventDefault();
          undoRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const [activeTab, setActiveTab] = useState<"editor" | "characters">("editor");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newCharName, setNewCharName] = useState("");
  const [newCharAliases, setNewCharAliases] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
  const [hoveredGap, setHoveredGap] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: "", onConfirm: () => {} });

  const requestConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, message, onConfirm });
  };

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (session?.user) {
        fetchProjects();
        fetchCharacters();
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Calculate word count
    let count = 0;
    blocks.forEach(b => {
      if (b.type === "action" || b.type === "scene_heading" || b.type === "transition") {
        count += (b.parsed as string).split(/\s+/).filter(w => w.length > 0).length;
      } else if (b.type === "dialogue_block") {
        count += b.parsed.dialogue.split(/\s+/).filter((w: string) => w.length > 0).length;
        count += b.parsed.speaker.split(/\s+/).filter((w: string) => w.length > 0).length;
        if (b.parsed.parenthetical) {
          count += b.parsed.parenthetical.split(/\s+/).filter((w: string) => w.length > 0).length;
        }
      }
    });
    setWordCount(count);
  }, [blocks]);

  const exportToTxt = () => {
    if (!currentProject) return;

    const PAGE_WIDTH = 60;
    const DIALOGUE_INDENT = 15;
    const DIALOGUE_WIDTH = 35;

    const wrapText = (text: string, maxWidth: number, indent: number): string => {
      const pad = " ".repeat(indent);
      const words = text.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        if (line.length + (line ? 1 : 0) + word.length <= maxWidth) {
          line += (line ? " " : "") + word;
        } else {
          if (line) lines.push(pad + line);
          line = word;
        }
      }
      if (line) lines.push(pad + line);
      return lines.join("\n");
    };

    const center = (text: string): string => {
      const pad = Math.max(0, Math.floor((PAGE_WIDTH - text.length) / 2));
      return " ".repeat(pad) + text;
    };

    let output = "";
    blocks.forEach(b => {
      if (b.type === "scene_heading") {
        output += String(b.parsed).toUpperCase() + "\n\n";
      } else if (b.type === "transition") {
        output += String(b.parsed).toUpperCase().padStart(PAGE_WIDTH) + "\n\n";
      } else if (b.type === "dialogue_block") {
        output += center(String(b.parsed.speaker).toUpperCase()) + "\n";
        if (b.parsed.parenthetical) {
          output += center(`(${b.parsed.parenthetical})`) + "\n";
        }
        output += wrapText(String(b.parsed.dialogue), DIALOGUE_WIDTH, DIALOGUE_INDENT) + "\n\n";
      } else if (b.type === "action") {
        output += wrapText(String(b.parsed), PAGE_WIDTH, 0) + "\n\n";
      }
    });

    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentProject.title || "script"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPdf = () => {
    if (!currentProject) return;
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
      let y = 72;
      const pageWidth = 612;
      const pageHeight = 792;
      const leftMargin = 108;  // 1.5"
      const rightMargin = 72;  // 1"
      const usableWidth = pageWidth - leftMargin - rightMargin; // 432pt
      const lineHeight = 14;

      // Dialogue column mirrors the UI: centered 60% of usable width
      const dialogueColWidth = usableWidth * 0.6;
      const dialogueColLeft = leftMargin + (usableWidth - dialogueColWidth) / 2;

      const checkPage = () => {
        if (y > pageHeight - 72) { doc.addPage(); y = 72; }
      };

      // Draw text twice at a tiny offset to match the visual weight of Courier New on screen
      const thickText = (text: string, x: number, yPos: number) => {
        doc.text(text, x, yPos);
        doc.text(text, x + 0.25, yPos);
      };

      blocks.forEach(b => {
        if (b.type === "scene_heading") {
          doc.setFont("courier", "bold");
          doc.setFontSize(12);
          const lines = doc.splitTextToSize(String(b.parsed).toUpperCase(), usableWidth);
          lines.forEach((line: string) => { checkPage(); thickText(line, leftMargin, y); y += lineHeight; });
          y += lineHeight;
        } else if (b.type === "transition") {
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          const text = String(b.parsed).toUpperCase();
          checkPage();
          thickText(text, pageWidth - rightMargin - doc.getTextWidth(text), y);
          y += lineHeight * 2;
        } else if (b.type === "dialogue_block") {
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          const speaker = String(b.parsed.speaker).toUpperCase();
          checkPage();
          thickText(speaker, dialogueColLeft + (dialogueColWidth - doc.getTextWidth(speaker)) / 2, y);
          y += lineHeight;
          if (b.parsed.parenthetical) {
            doc.setFont("courier", "italic");
            doc.setFontSize(11);
            const paren = `(${b.parsed.parenthetical})`;
            doc.splitTextToSize(paren, dialogueColWidth).forEach((line: string) => {
              checkPage();
              thickText(line, dialogueColLeft + (dialogueColWidth - doc.getTextWidth(line)) / 2, y);
              y += lineHeight;
            });
          }
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          doc.splitTextToSize(String(b.parsed.dialogue), dialogueColWidth).forEach((line: string) => {
            checkPage();
            thickText(line, dialogueColLeft, y);
            y += lineHeight;
          });
          y += lineHeight;
        } else if (b.type === "action") {
          doc.setFont("courier", "normal");
          doc.setFontSize(12);
          doc.splitTextToSize(String(b.parsed), usableWidth).forEach((line: string) => {
            checkPage();
            thickText(line, leftMargin, y);
            y += lineHeight;
          });
          y += lineHeight;
        }
      });

      doc.save(`${currentProject.title || "script"}.pdf`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
    }
  };

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { console.error(error); return; }
    const projects = data || [];
    setProjects(projects);
    if (projects.length > 0) {
      setCurrentProject(prev => {
        if (!prev) {
          parseContentToBlocks(projects[0].content);
          return projects[0];
        }
        return prev;
      });
    }
  };

  const fetchCharacters = async () => {
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .order("canonical_name");
    if (error) { console.error(error); return; }
    setCharacters(data || []);
  };

  const createProject = async () => {
    const { data, error } = await supabase
      .from("projects")
      .insert({ title: "New Script", content: "[]" })
      .select()
      .single();
    if (error) { console.error(error); return; }
    setProjects(prev => [data, ...prev]);
    setCurrentProject(data);
    setBlocks([]);
  };

  const saveProject = async () => {
    if (!currentProject) return;
    setIsSaving(true);
    const content = blocksToContent(blocks);
    await supabase
      .from("projects")
      .update({ title: currentProject.title, content, updated_at: new Date().toISOString() })
      .eq("id", currentProject.id);
    await fetchProjects();
    setTimeout(() => setIsSaving(false), 1000);
  };

  const addCharacter = async () => {
    if (!newCharName) return;
    const { error } = await supabase
      .from("characters")
      .insert({ canonical_name: newCharName, aliases: newCharAliases });
    if (error) { console.error(error); return; }
    setNewCharName("");
    setNewCharAliases("");
    fetchCharacters();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else { fetchProjects(); fetchCharacters(); }
    setAuthSubmitting(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    else setAuthError("✓ Check your email to confirm your account!");
    setAuthSubmitting(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProjects([]);
    setCurrentProject(null);
    setBlocks([]);
    setCharacters([]);
  };

  const parseContentToBlocks = (content: string) => {
    if (!content) {
      setBlocks([]);
      return;
    }
    try {
      const parsed = JSON.parse(content);
      setBlocks(parsed);
    } catch (e) {
      // Fallback for raw text
      setBlocks([{ type: "action", original: content, parsed: content }]);
    }
  };

  const blocksToContent = (blks: ParsedBlock[]) => {
    return JSON.stringify(blks);
  };

  // Auto-save: persist blocks to Supabase whenever they change (debounced)
  const autoSaveTimerRef = useRef<any>(null);
  useEffect(() => {
    if (!currentProject || blocks === undefined) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const content = blocksToContent(blocks);
      if (content === currentProject.content) return; // no change
      await supabase
        .from("projects")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", currentProject.id);
      // Update local project reference so future comparisons work
      setCurrentProject(prev => prev ? { ...prev, content } : prev);
      setProjects(prev => prev.map(p => p.id === currentProject.id ? { ...p, content } : p));
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [blocks, currentProject?.id]);

  const punctuationMap: Record<string, string> = {
    "comma": ",",
    "period": ".",
    "full stop": ".",
    "question mark": "?",
    "exclamation mark": "!",
    "exclamation point": "!",
    "colon": ":",
    "semicolon": ";",
    "dot dot dot": "...",
    "dot dot": "...",
    "ellipsis": "...",
    "dash": "-",
    "hyphen": "-",
    "open parenthesis": "(",
    "close parenthesis": ")",
    "open parentheses": "(",
    "close parentheses": ")",
    "parentheses open": "(",
    "parentheses close": ")",
    "parenthesis open": "(",
    "parenthesis close": ")",
    "open bracket": "[",
    "close bracket": "]",
    "open brace": "{",
    "close brace": "}",
    "apostrophe": "'",
    "quote": '"',
    "double quote": '"',
    "slash": "/",
    "backslash": "\\",
    "ampersand": "&",
    "percent": "%",
    "dollar": "$",
    "pound": "#",
    "star": "*",
    "asterisk": "*",
    "at sign": "@",
    "hash": "#",
    "underscore": "_",
    "plus": "+",
    "equals": "=",
    "less than": "<",
    "greater than": ">",
  };

function replaceSpokenPunctuation(text: string): string {
  let result = text;
  // Replace both "open parenthesis" and "parenthesis open" forms
  for (const [word, symbol] of Object.entries(punctuationMap)) {
    // Allow both "open parenthesis" and "parenthesis open" word order
    const parts = word.split(" ");
    if (parts.length === 2) {
      const [a, b] = parts;
      const regex1 = new RegExp(`\\b${a} ${b}\\b`, "gi");
      const regex2 = new RegExp(`\\b${b} ${a}\\b`, "gi");
      result = result.replace(regex1, symbol);
      result = result.replace(regex2, symbol);
    } else {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      result = result.replace(regex, symbol);
    }
  }
  // Remove any space before punctuation
  result = result.replace(/\s+([^\w\s])/g, '$1');
  result = result.replace(/\s{2,}/g, ' ');
  // Capitalize first letter after strong punctuation
  result = result.replace(/([.?!]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
  return result.trim();
}

  // Speech Recognition Setup
  useEffect(() => {
    if ("webkitSpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        let interimTranscript = "";
        let newFinalText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            newFinalText += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        // Apply spoken punctuation detection
        interimTranscript = replaceSpokenPunctuation(interimTranscript);
        newFinalText = replaceSpokenPunctuation(newFinalText);

        // --- EXACT LOGIC REQUESTED ---
        if (newFinalText) {
          const lowerText = newFinalText.toLowerCase();
          if (lowerText.includes("next line")) {
            // Remove "next line" and process immediately
            const cleanedText = replaceSpokenPunctuation(newFinalText.replace(/next line/gi, "").trim());
            accumulatedTextRef.current += (accumulatedTextRef.current && cleanedText ? " " : "") + cleanedText;

            const textToProcess = accumulatedTextRef.current;
            if (textToProcess.trim()) {
              processSpeech(textToProcess);
              accumulatedTextRef.current = "";
              setAccumulatedTranscript("");
              setSecondsLeft(0);
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
              setTranscript("");
              return;
            }
          }

          const startsWithPunct = /^[^\w\s]/.test(newFinalText);
          accumulatedTextRef.current += (accumulatedTextRef.current && !startsWithPunct ? " " : "") + newFinalText;
          setAccumulatedTranscript(accumulatedTextRef.current);
        }

        setTranscript(interimTranscript);

        // Start the 10-second timer and countdown
        setSecondsLeft(10);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = setInterval(() => {
          setSecondsLeft(prev => Math.max(0, prev - 1));
        }, 1000);

        silenceTimerRef.current = setTimeout(() => {
          const textToProcess = accumulatedTextRef.current;
          if (textToProcess.trim()) {
            processSpeech(textToProcess);
            accumulatedTextRef.current = "";
            setAccumulatedTranscript("");
            setSecondsLeft(0);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setTranscript("");
          }
        }, 10000);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        isListeningRef.current = false;
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.error("Failed to restart recognition", e);
          }
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleListening = (index?: number) => {
    if (isListening) {
      // If clicking a different mic button while already listening, just change the index
      if (index !== undefined && index !== insertionIndex) {
        setInsertionIndex(index);
        return;
      }

      recognitionRef.current?.stop();
      isListeningRef.current = false;
      // Process remaining text immediately on stop
      if (accumulatedTextRef.current.trim()) {
        processSpeech(accumulatedTextRef.current);
        accumulatedTextRef.current = "";
        setAccumulatedTranscript("");
        setSecondsLeft(0);
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setInsertionIndex(null);
    } else {
      setInsertionIndex(index !== undefined ? index : null);
      try {
        recognitionRef.current?.start();
        isListeningRef.current = true;
      } catch (e) {
        console.error("Failed to start recognition", e);
      }
    }
    setIsListening(!isListening);
  };

  // Track last dialogue speaker for CONT’D
  const lastSpeakerRef = useRef<string | null>(null);
  const processSpeech = (text: string) => {
    if (!text.trim()) return;
    const data = parseNLP(text.trim(), characters, lastSpeakerRef.current);
    // If this is a dialogue continuation, update speaker
    if (data.type === "dialogue_block") {
      if (data.isContinued && data.parsed.speaker) {
        data.parsed.speaker = `${data.parsed.speaker} (CONT’D)`;
      }
      lastSpeakerRef.current = data.parsed.speaker.replace(/ \(CONT’D\)$/i, "");
    } else {
      lastSpeakerRef.current = null;
    }
    
    updateBlocks((prev) => {
      const newBlocks = [...prev];
      const index = insertionIndex !== null ? insertionIndex : prev.length;
      newBlocks.splice(index, 0, data);
      return newBlocks;
    });

    if (insertionIndex !== null) {
      setInsertionIndex(prev => prev !== null ? prev + 1 : null);
    }
  };

  const insertTemplate = (index: number, type: string, parsed: any) => {
    const newBlocks = [...blocks];
    newBlocks.splice(index, 0, {
      type,
      parsed,
      original: ""
    });
    updateBlocks(newBlocks);
  };

  const [manualInput, setManualInput] = useState("");

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      processSpeech(replaceSpokenPunctuation(manualInput));
      setManualInput("");
    }
  };

  const renderBlock = (block: ParsedBlock, index: number) => {
    const updateBlockParsed = (newParsed: any) => {
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
          className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
          title="Delete block"
        >
          ×
        </button>
        {block.type === "scene_heading" && (
          <div 
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const val = e.currentTarget.innerText.trim();
              if (val !== block.parsed) updateBlockParsed(val);
            }}
            className="uppercase mt-2 mb-2 text-black font-bold outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text"
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
            className="uppercase text-right mt-2 mb-1 text-black outline-none focus:bg-stone-100 px-1 rounded transition-colors cursor-text"
          >
            {block.parsed}
          </div>
        )}
        {block.type === "dialogue_block" && (
          <div className="my-2 w-full flex flex-col items-center">
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
                <button
                  onClick={() => {
                    const newBlocks = [...blocks];
                    newBlocks.splice(index, 1);
                    updateBlocks(newBlocks);
                  }}
                  className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-xs"
                  title="Delete block"
                >×</button>
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
                <button
                  onClick={() => {
                    const newBlocks = [...blocks];
                    newBlocks.splice(index, 1);
                    updateBlocks(newBlocks);
                  }}
                  className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/line:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-xs"
                  title="Delete block"
                >×</button>
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

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen bg-stone-50 items-center justify-center">
        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-10 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8">
            <Mic className="text-emerald-600" size={24} />
            <h1 className="text-2xl font-bold tracking-tight">Ploki</h1>
          </div>
          <h2 className="text-lg font-medium mb-1">
            {authMode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <p className="text-stone-500 text-sm mb-6">
            {authMode === "signin" ? "Welcome back." : "Start writing your screenplay."}
          </p>
          <form onSubmit={authMode === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
            <input
              type="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
            />
            <input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full px-4 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500"
            />
            {authError && (
              <p className={`text-xs ${authError.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
                {authError}
              </p>
            )}
            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full px-4 py-2.5 bg-stone-900 text-white text-sm font-medium rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-colors"
            >
              {authSubmitting ? "..." : authMode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="text-center text-stone-500 text-xs mt-4">
            {authMode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(""); }}
              className="text-stone-900 font-medium underline"
            >
              {authMode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-stone-50 font-sans text-stone-900">
      {/* Sidebar */}
      <div className="w-64 bg-stone-100 border-r border-stone-200 flex flex-col">
        <div className="p-4 border-b border-stone-200 flex items-center gap-2">
          <Mic className="text-emerald-600" />
          <h1 className="text-xl font-bold tracking-tight">Ploki</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wider">Scripts</h2>
            <button onClick={createProject} className="p-1 hover:bg-stone-200 rounded">
              <Plus size={16} />
            </button>
          </div>
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="group relative">
                <button
                  onClick={async () => {
                    // Flush current project content before switching
                    if (currentProject && currentProject.id !== p.id) {
                      const content = blocksToContent(blocks);
                      if (content !== currentProject.content) {
                        await supabase
                          .from("projects")
                          .update({ content, updated_at: new Date().toISOString() })
                          .eq("id", currentProject.id);
                      }
                    }
                    setCurrentProject(p);
                    parseContentToBlocks(p.content);
                    setHistory([]);
                    setFuture([]);
                    setActiveTab("editor");
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                    currentProject?.id === p.id ? "bg-stone-200 font-medium" : "hover:bg-stone-200/50"
                  }`}
                >
                  <FileText size={14} className="text-stone-500" />
                  <span className="truncate flex-1">{p.title}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    requestConfirm("Delete this script?", async () => {
                      await supabase.from("projects").delete().eq("id", p.id);
                      fetchProjects();
                      if (currentProject?.id === p.id) {
                        setCurrentProject(null);
                        setBlocks([]);
                      }
                    });
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-stone-200">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-stone-500 uppercase">Daily Goal</span>
              <span className="text-xs font-medium text-emerald-600">{wordCount} / 500</span>
            </div>
            <div className="w-full bg-stone-200 rounded-full h-1.5">
              <div 
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min((wordCount / 500) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab("characters")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm ${
              activeTab === "characters" ? "bg-stone-200 font-medium" : "hover:bg-stone-200/50"
            }`}
          >
            <Users size={16} className="text-stone-500" />
            Characters
          </button>
          <div className="mt-2 pt-2 border-t border-stone-200">
            <div className="text-xs text-stone-400 truncate mb-1 px-1">{user?.email}</div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-stone-500 hover:bg-stone-200/50"
            >
              <LogOut size={16} className="text-stone-400" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-stone-200 bg-white flex items-center justify-between px-6">
          {activeTab === "editor" && currentProject ? (
            <input
              type="text"
              value={currentProject.title}
              onChange={(e) => {
                const newTitle = e.target.value;
                setCurrentProject({ ...currentProject, title: newTitle });
                setProjects((prev) => prev.map(p => p.id === currentProject.id ? { ...p, title: newTitle } : p));
              }}
              className="text-lg font-medium bg-transparent border-none focus:outline-none focus:ring-0 w-1/2"
              placeholder="Script Title"
            />
          ) : (
            <h2 className="text-lg font-medium">Empty</h2>
          )}
          
          <div className="flex items-center gap-3">
            {activeTab === "editor" && (
              <>
                <div className="flex items-center gap-1 mr-2 border-r border-stone-200 pr-2">
                  <button
                    onClick={undo}
                    disabled={history.length === 0}
                    className="p-1.5 text-stone-500 hover:bg-stone-100 rounded-md disabled:opacity-30 transition-colors"
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo size={18} />
                  </button>
                  <button
                    onClick={redo}
                    disabled={future.length === 0}
                    className="p-1.5 text-stone-500 hover:bg-stone-100 rounded-md disabled:opacity-30 transition-colors"
                    title="Redo (Ctrl+Shift+Z)"
                  >
                    <Redo size={18} />
                  </button>
                </div>
                <button
                  onClick={() => {
                    requestConfirm("Are you sure you want to clear the script?", async () => {
                      updateBlocks([]);
                      if (currentProject) {
                        await supabase
                          .from("projects")
                          .update({ content: "[]", updated_at: new Date().toISOString() })
                          .eq("id", currentProject.id);
                        setCurrentProject({ ...currentProject, content: "[]" });
                        fetchProjects();
                      }
                    });
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  Clear
                </button>
                <div className="flex bg-stone-100 rounded-md overflow-hidden">
                  <button
                    onClick={() => {
                      requestConfirm("Are you sure you want to export as PDF?", exportToPdf);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 transition-colors border-r border-stone-200"
                    title="Export as PDF"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <button
                    onClick={() => {
                      requestConfirm("Are you sure you want to export as Text?", exportToTxt);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 transition-colors"
                    title="Export as Text"
                  >
                    TXT
                  </button>
                </div>
                <button
                  onClick={() => {
                    requestConfirm("Are you sure you want to save the script?", saveProject);
                  }}
                  disabled={isSaving}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    isSaving ? "bg-emerald-50 text-emerald-600" : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <Save size={16} />
                  {isSaving ? "Saved!" : "Save"}
                </button>
                <button
                  onClick={() => toggleListening()}
                  className={`flex items-center gap-2 px-4 py-1 text-sm font-medium rounded-full transition-colors ${
                    isListening
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff size={16} />
                      Stop Listening
                    </>
                  ) : (
                    <>
                      <Mic size={16} />
                      Start Listening
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Workspace */}
        <main className="flex-1 overflow-y-auto bg-stone-50 p-8 flex justify-center">
          {activeTab === "editor" ? (
            <div id="script-content" className="w-full max-w-3xl bg-white shadow-sm border border-stone-200 min-h-full p-12 font-mono text-base leading-relaxed text-stone-950 subpixel-antialiased">
              {blocks.length === 0 ? (
                <div className="text-stone-400 text-center mt-20 italic">
                  Start dictating to write your script...
                  <br />
                  Try saying: "Scene heading interior kitchen day"
                  <br />
                  Or: "Emilio says Cassandra what did you do"
                </div>
              ) : (
                <>
                  {blocks.map((block, i) => (
                    <React.Fragment key={i}>
                      <InsertionBar 
                        index={i} 
                        onInsert={insertTemplate} 
                        onStartDictation={toggleListening}
                        isListeningAtThisIndex={isListening && insertionIndex === i}
                        accumulatedTranscript={accumulatedTranscript}
                        transcript={transcript}
                        secondsLeft={secondsLeft}
                        onHoverChange={setHoveredGap}
                      />
                      <div style={{ transform: hoveredGap === i ? 'translateY(2px)' : hoveredGap === i + 1 ? 'translateY(-2px)' : 'none', transition: 'transform 0.15s ease' }}>
                        {renderBlock(block, i)}
                      </div>
                    </React.Fragment>
                  ))}
                  <InsertionBar 
                    index={blocks.length} 
                    onInsert={insertTemplate} 
                    onStartDictation={toggleListening}
                    isListeningAtThisIndex={isListening && insertionIndex === blocks.length}
                    accumulatedTranscript={accumulatedTranscript}
                    transcript={transcript}
                    secondsLeft={secondsLeft}
                    onHoverChange={setHoveredGap}
                  />
                </>
              )}
              
              {isListening && insertionIndex === null && (
                <div className="mt-4 text-stone-400 italic flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <span className="text-stone-600">{accumulatedTranscript}</span>
                    {secondsLeft > 0 && (
                      <span className="text-[10px] bg-stone-100 text-stone-400 px-1.5 py-0.5 rounded-full font-sans not-italic">
                        Processing in {secondsLeft}s...
                      </span>
                    )}
                  </div>
                  <span className="text-stone-400">{transcript || (!accumulatedTranscript ? "Listening..." : "")}</span>
                </div>
              )}
              
              <form onSubmit={handleManualSubmit} className="mt-8 pt-4 border-t border-stone-100 flex gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Type a scene heading, action, or dialogue..."
                  className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-medium font-sans text-sm"
                >
                  Add
                </button>
              </form>
            </div>
          ) : (
            <div className="w-full max-w-3xl">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
                <h3 className="text-lg font-medium mb-4">Add Character</h3>
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Canonical Name (e.g. EMILIO)"
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    className="flex-1 px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Aliases (comma separated, e.g. Em, E)"
                    value={newCharAliases}
                    onChange={(e) => setNewCharAliases(e.target.value)}
                    className="flex-1 px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={addCharacter}
                    className="px-6 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Canonical Name</th>
                      <th className="px-6 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Aliases</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {characters.map((c) => (
                      <tr key={c.id} className="group">
                        <td className="px-6 py-4 font-medium text-stone-900">{c.canonical_name}</td>
                        <td className="px-6 py-4 text-stone-500">{c.aliases}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              requestConfirm("Delete this character?", async () => {
                                await supabase.from("characters").delete().eq("id", c.id);
                                fetchCharacters();
                              });
                            }}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {characters.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-stone-500 italic">
                          No characters added yet. Add characters to improve voice recognition.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
      {/* Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-medium text-stone-900 mb-2">Confirm Action</h3>
            <p className="text-stone-600 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog({ ...confirmDialog, isOpen: false });
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
