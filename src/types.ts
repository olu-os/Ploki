export interface Project {
  id: string;
  user_id: string;
  title: string;
  content: string;
  updated_at: string;
}

export interface Character {
  id: string;
  user_id: string;
  canonical_name: string;
  aliases: string;
}

export interface ParsedBlock {
  type: "action" | "scene_heading" | "transition" | "dialogue_block";
  original: string;
  parsed: any;
}
