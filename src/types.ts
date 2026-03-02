export interface Project {
  id: number;
  user_id: number;
  title: string;
  content: string;
  updated_at: string;
}

export interface Character {
  id: number;
  user_id: number;
  canonical_name: string;
  aliases: string;
}

export interface ParsedBlock {
  type: "action" | "scene_heading" | "transition" | "dialogue_block";
  original: string;
  parsed: any;
}
