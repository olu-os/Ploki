# Ploki

A storywriter powered by your voice.

Live demo: https://ploki.vercel.app

---

## How to Use

Ploki formats your script as you speak. Each block has a type you can set by **speaking** or **typing** certain phrases:

| Block type | How to create it |
|---|---|
| Action | Say it Normally (e.g. "Thunder strikes near the alley") |
| Dialogue | Say `[Character] says [Dialogue]`, you can use other verbs, in past tense as well. |
| Act header | Say `Act Header, Act [Number]`
| Scene heading | Say `Scene Heading: or Slugline:, [Scene Heading]` (e.g. Interior coffee shop at Night) |

### Parentheticals
Add a parenthetical to a dialogue block by saying `para [content] para` inside your dialogue:

> "David says para whispering para I know what you did"

You can also click the **(+)** button that appears next to a speaker's name on hover.

### Characters & Aliases
Add characters in the Characters panel. You can give each character aliases (nicknames, shortened names) so Ploki auto-detects who's speaking even if you type a variant of their name.

---

## Editing & Navigation

### Select & Delete Blocks
Click and drag on the script background to draw a selection box around multiple blocks. Selected blocks are highlighted. Press **Delete** or **Backspace** to remove them.

### Title Page
Click **Title Page** at the top of the editor to expand and edit the title, author, and other title-page fields.

### Version History
Ploki auto-saves your script when you're done typing. If you want to manually save, click the **Save** icon in the toolbar. Click the **History** icon in the toolbar to open the version history panel and restore any previous version.

### Trash
Deleting a non-empty project moves it to the **Trash** rather than removing it immediately. Projects in Trash are permanently deleted after **30 days**. Open the Trash from the sidebar to view or restore them.

### Settings
Click the **Settings** tab (gear icon) to configure:
- **Punctuation mode** — Auto (Azure AI), Spoken (e.g. "period", "comma"), or None
- **Segmentation silence** — How long a pause triggers a new block (s)
- **Auto-stop silence** — How long of silence stops listening entirely (s)
- **Daily word goal** — Sets the progress bar target in the sidebar

---

## Devs: Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. Run the API server:
   `npm run server`