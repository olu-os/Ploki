create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  title text not null default 'New Script',
  content text not null default '[]',
  updated_at timestamptz not null default now()
);
alter table projects enable row level security;
create policy "Users manage own projects" on projects for all using (auth.uid() = user_id);

create table characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  canonical_name text not null,
  aliases text not null default '',
  created_at timestamptz not null default now()
);
alter table characters enable row level security;
create policy "Users manage own characters" on characters for all using (auth.uid() = user_id);