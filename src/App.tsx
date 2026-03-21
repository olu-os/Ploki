import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Save, FileText, Users, Plus, Download, Undo, Redo, LogOut, History } from "lucide-react";
import { Project, Character, ParsedBlock, ProjectVersion, TitlePageData } from "./types";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { supabase } from "./lib/supabase";
import { parseNLP } from "./lib/parseNLP";
import { replaceSpokenPunctuation } from "./lib/punctuation";
import { paginateBlocks, Page } from "./lib/pagination";
import { exportToTxt, exportToPdf } from "./lib/exportScript";
import { InsertionBar } from "./components/InsertionBar";
import { AuthScreen } from "./components/AuthScreen";
import { ScriptBlock } from "./components/ScriptBlock";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [accumulatedTranscript, setAccumulatedTranscript] = useState("");
  const silenceTimerRef = useRef<any>(null);
  const pendingStopRef = useRef(false);
  const toggleListeningRef = useRef<() => void>(() => {});
  const accumulatedTextRef = useRef("");
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  const processSpeechRef = useRef<(text: string) => void>(() => {});
  const charactersRef = useRef<Character[]>([]);
  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [history, setHistory] = useState<{ blocks: ParsedBlock[]; titlePage: TitlePageData | null }[]>([]);
  const [future, setFuture] = useState<{ blocks: ParsedBlock[]; titlePage: TitlePageData | null }[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [titlePage, setTitlePage] = useState<TitlePageData | null>(null);
  const titlePageRef = useRef<TitlePageData | null>(null);
  titlePageRef.current = titlePage;

  const [showTitlePage, setShowTitlePage] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const isDraggingRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const shiftKeyRef = useRef(false);

  const azureRecognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);

  const updateBlocks = (newBlocks: ParsedBlock[] | ((prev: ParsedBlock[]) => ParsedBlock[])) => {
    setBlocks(prev => {
      const next = typeof newBlocks === 'function' ? newBlocks(prev) : newBlocks;
      setHistory(h => [...h.slice(-49), { blocks: prev, titlePage: titlePageRef.current }]);
      setFuture([]);
      return next;
    });
  };

  const updateTitlePage = (update: Partial<TitlePageData> | ((prev: TitlePageData | null) => TitlePageData | null)) => {
    setTitlePage(prev => {
      const next = typeof update === 'function' ? update(prev) : (prev ? { ...prev, ...update } : null);
      if (next !== prev) {
        setHistory(h => [...h.slice(-49), { blocks, titlePage: prev }]);
        setFuture([]);
      }
      return next;
    });
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(f => [{ blocks, titlePage }, ...f]);
    setHistory(h => h.slice(0, -1));
    setBlocks(previous.blocks);
    setTitlePage(previous.titlePage);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, { blocks, titlePage }]);
    setFuture(f => f.slice(1));
    setBlocks(next.blocks);
    setTitlePage(next.titlePage);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === ".") {
        e.preventDefault();
        toggleListeningRef.current();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIndices.size > 0) {
        // Check if we're not in an input/textarea
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && !document.activeElement?.hasAttribute("contenteditable")) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndices]);

  const deleteSelected = () => {
    if (selectedIndices.size === 0) return;
    updateBlocks(prev => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
  };

  const updateSelection = (clientX: number, clientY: number, isInitial = false) => {
    if (!isDraggingRef.current) return;
    
    const container = document.getElementById('script-content');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setSelectionBox(prev => {
      const startX = isInitial ? x : (prev?.startX ?? x);
      const startY = isInitial ? y : (prev?.startY ?? y);
      return { startX, startY, endX: x, endY: y };
    });

    // Calculate selection rectangle in viewport coordinates for intersection check
    setSelectionBox(current => {
      if (!current) return null;
      
      const selRect = {
        left: Math.min(current.startX, x) + rect.left,
        top: Math.min(current.startY, y) + rect.top,
        right: Math.max(current.startX, x) + rect.left,
        bottom: Math.max(current.startY, y) + rect.top
      };

      // Find blocks that intersect with the selection rectangle
      const newSelected = new Set(shiftKeyRef.current ? selectedIndices : []);
      const blockElements = document.querySelectorAll('[data-block-index]');
      blockElements.forEach(el => {
        const elRect = el.getBoundingClientRect();
        const index = parseInt(el.getAttribute('data-block-index') || '-1');
        
        const intersects = !(
          elRect.right < selRect.left ||
          elRect.left > selRect.right ||
          elRect.bottom < selRect.top ||
          elRect.top > selRect.bottom
        );

        if (intersects && index !== -1) {
          newSelected.add(index);
        }
      });

      setSelectedIndices(newSelected as Set<number>);
      return current;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start selection if clicking on the background or a block
    const target = e.target as HTMLElement;
    const isButton = target.closest('button');
    const isInput = target.closest('input') || target.closest('[contenteditable="true"]');
    
    if (isButton || isInput) return;

    const blockElement = target.closest('[data-block-index]');
    const blockIndex = blockElement ? parseInt(blockElement.getAttribute('data-block-index') || '-1') : -1;

    isDraggingRef.current = true;
    mousePosRef.current = { x: e.clientX, y: e.clientY };
    shiftKeyRef.current = e.shiftKey;
    
    updateSelection(e.clientX, e.clientY, true);

    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (blockIndex !== -1) {
        // If clicking on a block, select it if it's not already selected
        if (!selectedIndices.has(blockIndex)) {
          setSelectedIndices(new Set([blockIndex]));
        }
      } else {
        setSelectedIndices(new Set());
      }
    } else if (blockIndex !== -1) {
      // Toggle selection with modifier keys
      const newSelected = new Set(selectedIndices);
      if (newSelected.has(blockIndex)) {
        newSelected.delete(blockIndex);
      } else {
        newSelected.add(blockIndex);
      }
      setSelectedIndices(newSelected);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    mousePosRef.current = { x: e.clientX, y: e.clientY };
    shiftKeyRef.current = e.shiftKey;
    updateSelection(e.clientX, e.clientY);
  };

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (!isDraggingRef.current) return;
    updateSelection(mousePosRef.current.x, mousePosRef.current.y);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setSelectionBox(null);
  };

  const [activeTab, setActiveTab] = useState<"editor" | "characters">("editor");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newCharName, setNewCharName] = useState("");
  const [newCharAliases, setNewCharAliases] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null);
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
    let count = 0;
    blocks.forEach(b => {
      if (b.type === "action" || b.type === "scene_heading" || b.type === "transition" || b.type === "act_header") {
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
          const tp = projects[0].title_page ?? null;
          setTitlePage(tp);
          setShowTitlePage(!!tp);
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
    charactersRef.current = data || [];
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
    setTitlePage(null);
    setShowTitlePage(false);
  };

  const saveProject = async () => {
    if (!currentProject) return;
    setIsSaving(true);
    const content = blocksToContent(blocks);
    await supabase
      .from("projects")
      .update({ title: currentProject.title, content, title_page: titlePage, updated_at: new Date().toISOString() })
      .eq("id", currentProject.id);
    await supabase
      .from("project_versions")
      .insert({ project_id: currentProject.id, content });
    await fetchProjects();
    if (showVersionHistory) fetchVersions(currentProject.id);
    setTimeout(() => setIsSaving(false), 1000);
  };

  const fetchVersions = async (projectId: string) => {
    setLoadingVersions(true);
    const { data, error } = await supabase
      .from("project_versions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) { console.error(error); setLoadingVersions(false); return; }
    setVersions(data || []);
    setLoadingVersions(false);
  };

  const restoreVersion = (version: ProjectVersion) => {
    requestConfirm("Restore this version? Current unsaved changes will be replaced.", () => {
      parseContentToBlocks(version.content);
      setShowVersionHistory(false);
    });
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
      if (Array.isArray(parsed)) {
        setBlocks(parsed);
      } else if (parsed && Array.isArray(parsed.blocks)) {
        setBlocks(parsed.blocks);
      } else {
        setBlocks([]);
      }
    } catch (e) {
      setBlocks([{ type: "action", original: content, parsed: content }]);
    }
  };

  const blocksToContent = (blks: ParsedBlock[]) => {
    return JSON.stringify(blks);
  };

  // Auto-save
  const autoSaveTimerRef = useRef<any>(null);
  const lastSavedContentRef = useRef<string>("");
  const lastSavedTitleRef = useRef<string>("");
  useEffect(() => {
    if (!currentProject || blocks === undefined) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const content = blocksToContent(blocks);
      const title = currentProject.title;
      const shouldSaveContent = content !== currentProject.content || content !== lastSavedContentRef.current;
      const shouldSaveTitle = title !== lastSavedTitleRef.current;
      if (!shouldSaveContent && !shouldSaveTitle) return;
      await supabase
        .from("projects")
        .update({ content, title, title_page: titlePage, updated_at: new Date().toISOString() })
        .eq("id", currentProject.id);
      setCurrentProject(prev => prev ? { ...prev, content, title, title_page: titlePage } : prev);
      setProjects(prev => prev.map(p => p.id === currentProject.id ? { ...p, content, title, title_page: titlePage } : p));
      lastSavedContentRef.current = content;
      lastSavedTitleRef.current = title;
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [blocks, currentProject?.title, currentProject?.id, titlePage]);

  // Speech Recognition Setup (Azure)
  useEffect(() => {
    const stopAzure = () => {
      if (azureRecognizerRef.current) {
        azureRecognizerRef.current.stopContinuousRecognitionAsync(() => {
          // If no `recognized` event fired (silence/no speech), process whatever was accumulated
          if (pendingStopRef.current) {
            pendingStopRef.current = false;
            const textToProcess = accumulatedTextRef.current;
            if (textToProcess.trim()) {
              processSpeechRef.current(textToProcess);
              accumulatedTextRef.current = "";
              setAccumulatedTranscript("");
            }
            setTranscript("");
          }
          azureRecognizerRef.current?.close();
          azureRecognizerRef.current = null;
        });
      }
    };

    const startAzure = async (onTranscript: (text: string, isFinal: boolean) => void) => {
      try {
        const key = import.meta.env.VITE_AZURE_SPEECH_KEY;
        const region = import.meta.env.VITE_AZURE_SPEECH_REGION;

        if (!key || !region) {
          console.error("Azure credentials missing.");
          return;
        }

        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechRecognitionLanguage = "en-US";
        // Request detailed output to get access to ITN/Lexical fields if needed
        speechConfig.outputFormat = SpeechSDK.OutputFormat.Detailed;
        // Explicitly disable punctuation and ITN (Inverse Text Normalization)
        speechConfig.setServiceProperty('punctuation', 'explicit', SpeechSDK.ServicePropertyChannel.UriQueryParameter);
        
        const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
        azureRecognizerRef.current = recognizer;

        // Phrase list for character names
        const phraseList = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
        phraseList.addPhrases(["para"]);
        charactersRef.current.forEach(c => {
          phraseList.addPhrase(c.canonical_name);
          if (c.aliases) c.aliases.split(",").forEach(a => phraseList.addPhrase(a.trim()));
        });

        recognizer.recognizing = (s, e) => {
          onTranscript(e.result.text, false);
        };
        recognizer.recognized = (s, e) => {
          if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            onTranscript(e.result.text, true);
          }
        };

        recognizer.startContinuousRecognitionAsync();
      } catch (err) {
        console.error("Azure error:", err);
      }
    };

    const handleTranscript = (text: string, isFinal: boolean) => {
      if (!isFinal) {
        setTranscript(replaceSpokenPunctuation(text, false));
        return;
      }

      //prevents Azure from replacing next line, which we use as a marker for new lines in the spoken input, with \n
      const newFinalText = replaceSpokenPunctuation(text.replace(/\n+/g, " next line ").trim(), false);
      if (newFinalText) {
        const lowerText = newFinalText.toLowerCase();

        // Voice command: clear accumulated line
        if (lowerText.includes("clear line") || lowerText.includes("clear that") || lowerText.includes("delete line") || lowerText.includes("scratch that")) {
          accumulatedTextRef.current = "";
          setAccumulatedTranscript("");
          setTranscript("");
          return;
        }

        if (lowerText.includes("next line") || lowerText.includes("x line") || lowerText.includes("next slide") || lowerText.includes("x slide") || lowerText.includes("next lie") || lowerText.includes("x lie")) {
          // Combine whatever was already accumulated with this new utterance
          const startsWithPunct = /^[.,!?:;]/.test(newFinalText);
          const combined = (accumulatedTextRef.current + (accumulatedTextRef.current && !startsWithPunct ? " " : "") + newFinalText).trim();
          // Split on every "next line" variant to get individual blocks
          const segments = combined.split(/next line|x line|next slide|x slide|next lie|x lie/gi).map(s => s.trim()).filter(Boolean);
          accumulatedTextRef.current = "";
          setAccumulatedTranscript("");
          setTranscript("");
          for (const seg of segments) {
            processSpeechRef.current(seg);
          }
          return;
        }

        const startsWithPunct = /^[.,!?:;]/.test(newFinalText);
        accumulatedTextRef.current += (accumulatedTextRef.current && !startsWithPunct ? " " : "") + newFinalText;
        setAccumulatedTranscript(accumulatedTextRef.current);

        // If user pressed stop while this was interim, now process and finish stopping
        if (pendingStopRef.current) {
          pendingStopRef.current = false;
          processSpeechRef.current(accumulatedTextRef.current);
          accumulatedTextRef.current = "";
          setAccumulatedTranscript("");
        }
      }

      setTranscript("");

      // Reset 20-second silence auto-stop timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) toggleListeningRef.current();
      }, 20000);
    };

    recognitionRef.current = {
      start: () => startAzure(handleTranscript),
      stop: () => stopAzure(),
    };

    if (isListeningRef.current) {
      recognitionRef.current.start();
    }

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      stopAzure();
    };
  }, []);

  const handleAccumulatedTranscriptChange = (text: string) => {
    setAccumulatedTranscript(text);
    accumulatedTextRef.current = text;
  };

  const toggleListening = (index?: number) => {
    if (isListening) {
      if (index !== undefined && index !== insertionIndex) {
        setInsertionIndex(index);
        return;
      }

      isListeningRef.current = false;
      pendingStopRef.current = true;
      setTranscript(""); // Clear interim display; final result will come from Azure
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setInsertionIndex(null);
    } else {
      // Start 20-second silence timer when listening begins
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) toggleListeningRef.current();
      }, 20000);
      setInsertionIndex(index !== undefined ? index : blocks.length);
      try {
        recognitionRef.current?.start();
        isListeningRef.current = true;
      } catch (e) {
        console.error("Failed to start recognition", e);
      }
    }
    setIsListening(!isListening);
  };

  const lastSpeakerRef = useRef<string | null>(null);
  const processSpeech = (text: string) => {
    if (!text.trim()) return;
    const data = parseNLP(text.trim(), characters, lastSpeakerRef.current);
    if (data.type === "dialogue_block") {
      if (data.isContinued && data.parsed.speaker && !/\(CONT'D\)$/i.test(data.parsed.speaker)) {
        data.parsed.speaker = `${data.parsed.speaker} (CONT'D)`;
      }
      lastSpeakerRef.current = data.parsed.speaker.replace(/ \(CONT'D\)$/i, "");
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
  processSpeechRef.current = processSpeech;
  toggleListeningRef.current = () => toggleListening();

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
      processSpeech(manualInput);
      setManualInput("");
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={() => { fetchProjects(); fetchCharacters(); }} />;
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
                    if (autoSaveTimerRef.current) {
                      clearTimeout(autoSaveTimerRef.current);
                      autoSaveTimerRef.current = null;
                      if (currentProject && blocks !== undefined) {
                        const content = blocksToContent(blocks);
                        const title = currentProject.title;
                        await supabase
                          .from("projects")
                          .update({ content, title, title_page: titlePage, updated_at: new Date().toISOString() })
                          .eq("id", currentProject.id);
                        setCurrentProject(prev => prev ? { ...prev, content, title, title_page: titlePage } : prev);
                        setProjects(prev => prev.map(prj => prj.id === currentProject.id ? { ...prj, content, title, title_page: titlePage } : prj));
                        lastSavedContentRef.current = content;
                        lastSavedTitleRef.current = title;
                      }
                    }
                    setCurrentProject(p);
                    parseContentToBlocks(p.content);
                    const newTp = p.title_page ?? null;
                    setTitlePage(newTp);
                    setShowTitlePage(!!newTp);
                    setHistory([]);
                    setFuture([]);
                    setActiveTab("editor");
                  }}
                  className={`w-full text-left px-3 py-2 pr-10 rounded text-sm flex items-center gap-2 ${
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
        <header className="h-20 border-b border-stone-200 bg-white flex items-center justify-between px-6">
          {activeTab === "editor" && currentProject ? (
            <input
              type="text"
              value={currentProject.title}
              onChange={(e) => {
                const newTitle = e.target.value;
                setCurrentProject({ ...currentProject, title: newTitle });
                setProjects((prev) => prev.map(p => p.id === currentProject.id ? { ...p, title: newTitle } : p));
              }}
              className="text-lg font-medium bg-transparent border-none focus:outline-none focus:ring-0 flex-1 min-w-0 mr-3"
              placeholder="Script Title"
            />
          ) : (
            <h2 className="text-lg font-medium">Empty</h2>
          )}
          
          <div className="flex items-center gap-3 flex-shrink-0">
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
                      requestConfirm("Are you sure you want to export as PDF?", () => {
                        if (currentProject) exportToPdf({ title: currentProject.title, blocks, showTitlePage, titlePage });
                      });
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 transition-colors border-r border-stone-200"
                    title="Export as PDF"
                  >
                    <Download size={16} />
                    PDF
                  </button>
                  <button
                    onClick={() => {
                      requestConfirm("Are you sure you want to export as Text?", () => {
                        if (currentProject) exportToTxt({ title: currentProject.title, blocks, showTitlePage, titlePage });
                      });
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
                  onClick={() => {
                    setShowVersionHistory(v => !v);
                    if (!showVersionHistory && currentProject) fetchVersions(currentProject.id);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    showVersionHistory ? "bg-stone-200 text-stone-900" : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <History size={16} />
                  History
                </button>
                <button
                  onClick={() => {
                    if (!showTitlePage) {
                      setShowTitlePage(true);
                      if (!titlePage) setTitlePage({ title: currentProject?.title || "", subtitle: "", author: "", agencyName: "", agencyAddress: "" });
                    } else {
                      setShowTitlePage(false);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    showTitlePage ? "bg-stone-200 text-stone-900" : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <FileText size={16} />
                  Title Page
                </button>
                <button
                  onClick={() => toggleListening()}
                  className={`flex items-center gap-2 px-4 py-1 text-sm font-medium rounded-full transition-colors ${
                    isListening
                      ? "bg-red-100 text-red-700 hover:bg-red-200"
                      : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  }`}
                  title={isListening ? "Stop Listening (Ctrl+L)" : "Start Listening (Ctrl+L)"}
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
        <main 
          className="flex-1 overflow-y-auto bg-stone-200 p-8 flex flex-col items-center relative select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onScroll={handleScroll}
        >
          {selectedIndices.size > 0 && (
            <div className="fixed bottom-8 right-8 z-[110] animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="bg-white border border-stone-200 shadow-xl rounded-sm px-6 py-3 flex items-center gap-4">
                <span className="text-sm font-medium text-stone-600">
                  {selectedIndices.size} block{selectedIndices.size > 1 ? 's' : ''} selected
                </span>
                <div className="w-px h-4 bg-stone-200" />
                <button
                  onClick={deleteSelected}
                  className="px-4 py-2 text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors"
                >
                  Delete Selected
                </button>
                <button
                  onClick={() => setSelectedIndices(new Set())}
                  className="text-stone-400 hover:text-stone-600 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeTab === "editor" ? (
            <div id="script-content" className="w-full flex flex-col items-center relative">
              {selectionBox && Math.hypot(selectionBox.startX - selectionBox.endX, selectionBox.startY - selectionBox.endY) > 5 && (
                <div 
                  className="absolute border border-emerald-600 bg-emerald-600/5 pointer-events-none z-[100]"
                  style={{
                    left: Math.min(selectionBox.startX, selectionBox.endX),
                    top: Math.min(selectionBox.startY, selectionBox.endY),
                    width: Math.abs(selectionBox.startX - selectionBox.endX),
                    height: Math.abs(selectionBox.startY - selectionBox.endY),
                  }}
                />
              )}
              {showTitlePage && titlePage && (
                <div className="relative w-[8.5in] h-[11in] bg-white shadow-lg mb-8 pl-[1.5in] pr-[1in] font-mono text-[12pt] leading-[1.4] text-black overflow-hidden flex flex-col">
                  <div className="flex-1 flex flex-col items-center justify-center" style={{ paddingBottom: "3in" }}>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => { const v = e.currentTarget.innerText.trim(); updateTitlePage({ title: v }); }}
                      className="font-bold underline uppercase text-center outline-none min-w-[4px] empty:before:content-['Title'] empty:before:text-stone-300 empty:before:normal-case empty:before:no-underline"
                    >{titlePage.title}</div>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => { const v = e.currentTarget.innerText.trim(); updateTitlePage({ subtitle: v }); }}
                      className="text-center outline-none mt-3 min-w-[4px] empty:before:content-['Subtitle_(optional)'] empty:before:text-stone-300"
                    >{titlePage.subtitle}</div>
                    <div className="text-center mt-4">Written by</div>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => { const v = e.currentTarget.innerText.trim(); updateTitlePage({ author: v }); }}
                      className="text-center outline-none mt-1 min-w-[4px] empty:before:content-['Author_name'] empty:before:text-stone-300"
                    >{titlePage.author}</div>
                  </div>
                  <div className="absolute bottom-[1in] left-[1.5in] flex flex-col gap-0">
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => { const v = e.currentTarget.innerText.trim(); updateTitlePage({ agencyName: v }); }}
                      className="outline-none min-w-[4px] empty:before:content-['Agency_name_(optional)'] empty:before:text-stone-300"
                    >{titlePage.agencyName}</div>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => { const v = e.currentTarget.innerText.trim(); updateTitlePage({ agencyAddress: v }); }}
                      className="outline-none min-w-[4px] empty:before:content-['Agency_address_(optional)'] empty:before:text-stone-300"
                    >{titlePage.agencyAddress}</div>
                  </div>
                </div>
              )}
              {blocks.length === 0 ? (
                <Page pageNumber={1}>
                  <div className="relative h-full flex flex-col">
                    <InsertionBar 
                      index={0} 
                      onInsert={insertTemplate} 
                      onStartDictation={toggleListening}
                      isListeningAtThisIndex={isListening && insertionIndex === 0}
                      accumulatedTranscript={accumulatedTranscript}
                      transcript={transcript}
                      onAccumulatedTranscriptChange={handleAccumulatedTranscriptChange}
                    />
                    
                    <div className="mt-4">
                      {!isListening && (
                        <div className="text-stone-400 text-center mt-20 mb-8 italic font-mono">
                          Start dictating to write your script...
                          <br />
                          Try saying: "Scene heading interior kitchen day"
                          <br />
                          Or: "Emilio says Cassandra what did you do"
                        </div>
                      )}

                      <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <input
                          type="text"
                          value={manualInput}
                          onChange={(e) => setManualInput(e.target.value)}
                          placeholder="Type a scene heading, action, or dialogue..."
                          className="flex-1 bg-stone-50 border border-stone-200 rounded-sm px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans text-sm"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-stone-900 text-white rounded-sm hover:bg-stone-800 font-medium font-sans text-sm"
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  </div>
                </Page>
              ) : (
                <>
                  {paginateBlocks(blocks).map((page, pageIdx) => (
                    <Page key={pageIdx} pageNumber={pageIdx + 1}>
                      {page.blocks.map(({ block, index }) => (
                        <React.Fragment key={index}>
                          <InsertionBar 
                            index={index} 
                            onInsert={insertTemplate} 
                            onStartDictation={toggleListening}
                            isListeningAtThisIndex={isListening && insertionIndex === index}
                            accumulatedTranscript={accumulatedTranscript}
                            transcript={transcript}
                            onAccumulatedTranscriptChange={handleAccumulatedTranscriptChange}
                          />
                          <ScriptBlock 
                            block={block} 
                            index={index} 
                            blocks={blocks} 
                            updateBlocks={updateBlocks} 
                            isSelected={selectedIndices.has(index)}
                          />
                        </React.Fragment>
                      ))}
                      {pageIdx === paginateBlocks(blocks).length - 1 && (
                        <div className="mt-2">
                          <InsertionBar 
                            index={blocks.length} 
                            onInsert={insertTemplate} 
                            onStartDictation={toggleListening}
                            isListeningAtThisIndex={isListening && insertionIndex === blocks.length}
                            accumulatedTranscript={accumulatedTranscript}
                            transcript={transcript}
                            onAccumulatedTranscriptChange={handleAccumulatedTranscriptChange}
                          />
                          
                          <form onSubmit={handleManualSubmit} className="mt-8 pt-4 border-t border-stone-100 flex gap-2">
                            <input
                              type="text"
                              value={manualInput}
                              onChange={(e) => setManualInput(e.target.value)}
                              placeholder="Type a scene heading, action, or dialogue..."
                              className="flex-1 bg-stone-50 border border-stone-200 rounded-sm px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans text-sm"
                            />
                            <button
                              type="submit"
                              className="px-4 py-2 bg-stone-900 text-white rounded-sm hover:bg-stone-800 font-medium font-sans text-sm"
                            >
                              Add
                            </button>
                          </form>
                        </div>
                      )}
                    </Page>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="w-full max-w-3xl">
              <div className="bg-white p-6 rounded-sm shadow-sm border border-stone-200 mb-6">
                <h3 className="text-lg font-medium mb-4">Add Character</h3>
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Canonical Name (e.g. EMILIO)"
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    className="flex-1 px-4 py-2 border border-stone-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Aliases (comma separated, e.g. Em, E)"
                    value={newCharAliases}
                    onChange={(e) => setNewCharAliases(e.target.value)}
                    className="flex-1 px-4 py-2 border border-stone-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={addCharacter}
                    className="px-6 py-2 bg-stone-900 text-white rounded-sm hover:bg-stone-800 font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-sm shadow-sm border border-stone-200 overflow-hidden">
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
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            defaultValue={c.aliases}
                            onBlur={async (e) => {
                              const newVal = e.target.value;
                              if (newVal !== c.aliases) {
                                await supabase
                                  .from("characters")
                                  .update({ aliases: newVal })
                                  .eq("id", c.id);
                                fetchCharacters();
                              }
                            }}
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 text-stone-500"
                          />
                        </td>
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

      {/* Version History Panel */}
      {showVersionHistory && currentProject && (
        <div className="fixed right-0 top-0 bottom-0 w-72 bg-white border-l border-stone-200 flex flex-col shadow-xl z-40">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-700">Version History</h3>
            <button onClick={() => setShowVersionHistory(false)} className="text-stone-400 hover:text-stone-600 text-xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loadingVersions ? (
              <div className="text-xs text-stone-400 text-center py-8">Loading...</div>
            ) : versions.length === 0 ? (
              <div className="text-xs text-stone-400 text-center py-8 italic px-4">No saved versions yet.<br/>Use Save to create a checkpoint.</div>
            ) : (
              <ul className="space-y-1">
                {versions.map((v) => (
                  <li key={v.id} className="group flex items-center justify-between px-3 py-2.5 rounded hover:bg-stone-50">
                    <span className="text-xs text-stone-600">
                      {new Date(v.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => restoreVersion(v)}
                      className="text-xs text-stone-400 hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

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
