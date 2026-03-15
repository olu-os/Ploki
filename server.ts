import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new Database("ploki.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    canonical_name TEXT,
    aliases TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    period_type TEXT,
    target_word_count INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Basic Auth Mock (for resume purposes, we'll implement a simple mock auth)
  let currentUser = 1; // Mock user ID
  
  // Ensure mock user exists
  const userStmt = db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (?, ?, ?)");
  userStmt.run(1, "demo_user", "mock_hash");

  // Projects API
  app.get("/api/projects", (req, res) => {
    const stmt = db.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC");
    const projects = stmt.all(currentUser);
    res.json(projects);
  });

  app.post("/api/projects", (req, res) => {
    const { title, content } = req.body;
    const stmt = db.prepare("INSERT INTO projects (user_id, title, content) VALUES (?, ?, ?)");
    const info = stmt.run(currentUser, title || "Untitled Script", content || "");
    res.json({ id: info.lastInsertRowid, title, content });
  });

  app.put("/api/projects/:id", (req, res) => {
    const { title, content } = req.body;
    const { id } = req.params;
    const stmt = db.prepare("UPDATE projects SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?");
    stmt.run(title, content, id, currentUser);
    res.json({ success: true });
  });

  app.get("/api/projects/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?");
    const project = stmt.get(id, currentUser);
    if (project) {
      res.json(project);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/projects/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?");
    stmt.run(id, currentUser);
    res.json({ success: true });
  });

  // Characters API
  app.get("/api/characters", (req, res) => {
    const stmt = db.prepare("SELECT * FROM characters WHERE user_id = ?");
    const characters = stmt.all(currentUser);
    res.json(characters);
  });

  app.post("/api/characters", (req, res) => {
    const { canonical_name, aliases } = req.body;
    const stmt = db.prepare("INSERT INTO characters (user_id, canonical_name, aliases) VALUES (?, ?, ?)");
    const info = stmt.run(currentUser, canonical_name, aliases);
    res.json({ id: info.lastInsertRowid, canonical_name, aliases });
  });

  app.delete("/api/characters/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM characters WHERE id = ? AND user_id = ?");
    stmt.run(id, currentUser);
    res.json({ success: true });
  });

  // NLP Parsing API
  app.post("/api/parse", (req, res) => {
    const { text } = req.body;
    
    // Fetch characters for alias matching
    const stmt = db.prepare("SELECT * FROM characters WHERE user_id = ?");
    const characters = stmt.all(currentUser);
    
    // Simple parsing logic
    let parsedText = text;
    let type = "action"; // default
    
    // Check for scene headings (with or without colon)
    const lowerText = text.toLowerCase();
    const sceneHeadingMatch = text.match(/^scene heading:?\s*(.+)/i);
    if (sceneHeadingMatch) {
      type = "scene_heading";
      parsedText = sceneHeadingMatch[1].trim().toUpperCase();
      // Basic formatting if it contains exterior/interior
      parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
    } else if (lowerText.startsWith("new scene")) {
      type = "scene_heading";
      parsedText = text.replace(/^new scene,?\s*/i, "").toUpperCase();
      parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
    } else if (lowerText.startsWith("cut to") || lowerText.startsWith("fade out")) {
      type = "transition";
      parsedText = text.toUpperCase() + ":";
    } else {
      // Check for dialogue
      // "Emilio says Cass what did you do" or "Emilio angrily says..."
      const dialogueMatch = text.match(/^([\w\s]+?)\s+(?:(\w+)\s+)?(says|asks|yells|whispers|replies|responds|queries)(?:\s+(.+))?$/i);
      if (dialogueMatch) {
        let speaker = dialogueMatch[1].trim();
        const adverb = dialogueMatch[2] ? dialogueMatch[2].toLowerCase() : "";
        const action = dialogueMatch[3].toLowerCase();
        let dialogue = dialogueMatch[4] ? dialogueMatch[4].trim() : "";
        
        // Remove quotes if present
        dialogue = dialogue.replace(/^["']|["']$/g, "");
        
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
        if (adverb) parenthetical = `(${adverb})`;
        else if (action === "whispers") parenthetical = "(whispering)";
        else if (action === "yells") parenthetical = "(yelling)";
        else if (action === "asks") parenthetical = "(asking)";
        
        // Extract inline parenthetical like "it's scary (in a scared manner)"
        console.log("[parse] dialogue before paren extract:", JSON.stringify(dialogue));
        const inlineParenMatch = dialogue.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
        console.log("[parse] inlineParenMatch:", inlineParenMatch);
        if (inlineParenMatch) {
          const beforeParen = inlineParenMatch[1].trim();
          const parenContent = inlineParenMatch[2].trim();
          const afterParen = inlineParenMatch[3].trim();
          dialogue = (beforeParen + (afterParen ? " " + afterParen : "")).trim();
          if (!parenthetical) {
            parenthetical = parenContent;
          }
        }
        console.log("[parse] final dialogue:", JSON.stringify(dialogue), "parenthetical:", JSON.stringify(parenthetical));

        parsedText = {
          speaker,
          parenthetical,
          dialogue
        };
      } else {
        // Just action line — capitalize first letter
        type = "action";
        parsedText = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
    
    res.json({ original: text, parsed: parsedText, type });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
