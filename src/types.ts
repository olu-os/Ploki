export interface TitlePageData {
  title: string;
  subtitle: string;
  author: string;
  agencyName: string;
  agencyAddress: string;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  content: string;
  title_page: TitlePageData | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectVersion {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface Character {
  id: string;
  user_id: string;
  canonical_name: string;
  aliases: string;
}

export interface ParsedBlock {
  type: "action" | "scene_heading" | "transition" | "dialogue_block" | "act_header";
  original: string;
  parsed: any;
}
