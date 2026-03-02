import React, { useState, useEffect } from "react";
import { Mic, MicOff, Save, FileText, Settings, Users, Plus, Play, Pause, Download } from "lucide-react";
import { motion } from "motion/react";
import html2pdf from "html2pdf.js";
import { Project, Character, ParsedBlock } from "./types";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [activeTab, setActiveTab] = useState<"editor" | "characters">("editor");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [newCharName, setNewCharName] = useState("");
  const [newCharAliases, setNewCharAliases] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: "", onConfirm: () => {} });

  const requestConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, message, onConfirm });
  };

  useEffect(() => {
    fetchProjects();
    fetchCharacters();
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
    let text = "";
    blocks.forEach(b => {
      if (b.type === "scene_heading") {
        text += b.parsed + "\n\n";
      } else if (b.type === "transition") {
        text += String(b.parsed).padStart(60, " ") + "\n\n";
      } else if (b.type === "dialogue_block") {
        text += String(b.parsed.speaker).padStart(37, " ") + "\n";
        if (b.parsed.parenthetical) {
          text += String(b.parsed.parenthetical).padStart(31, " ") + "\n";
        }
        // Basic word wrap for dialogue could be added here, but for simplicity we'll just indent
        text += "                      " + String(b.parsed.dialogue) + "\n\n";
      } else {
        text += b.parsed + "\n\n";
      }
    });
    
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentProject.title || "script"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPdf = () => {
    if (!currentProject) return;
    const element = document.getElementById("script-content");
    if (!element) return;

    // Clone the element to remove the delete buttons before exporting
    const clone = element.cloneNode(true) as HTMLElement;
    const deleteButtons = clone.querySelectorAll("button");
    deleteButtons.forEach(btn => btn.remove());

    const opt = {
      margin:       1,
      filename:     `${currentProject.title || "script"}.pdf`,
      image:        { type: 'jpeg' as 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' as 'portrait' }
    };

    html2pdf().set(opt).from(clone).save();
  };

  const fetchProjects = async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
    if (data.length > 0 && !currentProject) {
      setCurrentProject(data[0]);
      parseContentToBlocks(data[0].content);
    }
  };

  const fetchCharacters = async () => {
    const res = await fetch("/api/characters");
    const data = await res.json();
    setCharacters(data);
  };

  const createProject = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Script", content: "" }),
    });
    const newProj = await res.json();
    setProjects([newProj, ...projects]);
    setCurrentProject(newProj);
    setBlocks([]);
  };

  const saveProject = async () => {
    if (!currentProject) return;
    setIsSaving(true);
    const content = blocksToContent(blocks);
    await fetch(`/api/projects/${currentProject.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: currentProject.title, content }),
    });
    await fetchProjects();
    setTimeout(() => setIsSaving(false), 1000);
  };

  const addCharacter = async () => {
    if (!newCharName) return;
    await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonical_name: newCharName, aliases: newCharAliases }),
    });
    setNewCharName("");
    setNewCharAliases("");
    fetchCharacters();
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

  // Speech Recognition Setup
  let recognition: any = null;
  if ("webkitSpeechRecognition" in window) {
    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
          processSpeech(event.results[i][0].transcript);
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        recognition.start(); // Keep listening if it was stopped automatically
      }
    };
  }

  const toggleListening = () => {
    if (isListening) {
      recognition?.stop();
    } else {
      recognition?.start();
    }
    setIsListening(!isListening);
  };

  const processSpeech = async (text: string) => {
    if (!text.trim()) return;
    
    // Send to backend for NLP parsing
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      setBlocks((prev) => [...prev, data]);
    } catch (e) {
      console.error("Failed to parse speech", e);
      setBlocks((prev) => [...prev, { type: "action", original: text, parsed: text }]);
    }
  };

  const [manualInput, setManualInput] = useState("");

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      processSpeech(manualInput);
      setManualInput("");
    }
  };

  const renderBlock = (block: ParsedBlock, index: number) => {
    return (
      <div key={index} className="group relative">
        <button
          onClick={() => {
            const newBlocks = [...blocks];
            newBlocks.splice(index, 1);
            setBlocks(newBlocks);
          }}
          className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
          title="Delete block"
        >
          ×
        </button>
        {block.type === "scene_heading" && (
          <div className="font-bold uppercase mt-6 mb-2 text-gray-800">
            {block.parsed}
          </div>
        )}
        {block.type === "transition" && (
          <div className="uppercase text-right mt-4 mb-4 text-gray-800">
            {block.parsed}
          </div>
        )}
        {block.type === "dialogue_block" && (
          <div className="flex flex-col items-center my-4 w-full">
            <div className="uppercase font-bold text-gray-800">{block.parsed.speaker}</div>
            {block.parsed.parenthetical && (
              <div className="text-gray-600 italic">({block.parsed.parenthetical})</div>
            )}
            <div className="w-3/4 text-center mt-1">{block.parsed.dialogue}</div>
          </div>
        )}
        {block.type === "action" && (
          <div className="my-2 text-gray-800 text-justify">
            {block.parsed}
          </div>
        )}
      </div>
    );
  };

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
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">Scripts</h2>
            <button onClick={createProject} className="p-1 hover:bg-stone-200 rounded">
              <Plus size={16} />
            </button>
          </div>
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="group relative">
                <button
                  onClick={() => {
                    setCurrentProject(p);
                    parseContentToBlocks(p.content);
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
                      await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
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
              onChange={(e) => setCurrentProject({ ...currentProject, title: e.target.value })}
              className="text-lg font-medium bg-transparent border-none focus:outline-none focus:ring-0 w-1/2"
              placeholder="Script Title"
            />
          ) : (
            <h2 className="text-lg font-medium">Character Dictionary</h2>
          )}
          
          <div className="flex items-center gap-3">
            {activeTab === "editor" && (
              <>
                <button
                  onClick={() => {
                    requestConfirm("Are you sure you want to clear the script?", async () => {
                      setBlocks([]);
                      if (currentProject) {
                        await fetch(`/api/projects/${currentProject.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ title: currentProject.title, content: "[]" }),
                        });
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
                  onClick={toggleListening}
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
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
                      Start Dictation
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
            <div id="script-content" className="w-full max-w-3xl bg-white shadow-sm border border-stone-200 min-h-full p-12 font-mono text-sm leading-relaxed">
              {blocks.length === 0 ? (
                <div className="text-stone-400 text-center mt-20 italic">
                  Start dictating to write your script...
                  <br />
                  Try saying: "Scene heading interior kitchen day"
                  <br />
                  Or: "Emilio says Cassandra what did you do"
                </div>
              ) : (
                blocks.map((block, i) => renderBlock(block, i))
              )}
              
              {isListening && (
                <div className="mt-4 text-stone-400 italic flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  {transcript || "Listening..."}
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
                                await fetch(`/api/characters/${c.id}`, { method: "DELETE" });
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
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
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
