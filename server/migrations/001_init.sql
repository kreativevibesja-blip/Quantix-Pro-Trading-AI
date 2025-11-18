-- Initial schema for Supabase/Postgres
-- NOTE: Run this in the Supabase SQL editor. Enable Row Level Security (RLS) only after adding policies.

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspaces (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  from_number TEXT,
  to_number TEXT,
  direction TEXT CHECK (direction IN ('in','out')),
  text TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_direction_idx ON public.messages(direction);
CREATE INDEX IF NOT EXISTS messages_created_idx ON public.messages(created_at);

CREATE TABLE IF NOT EXISTS public.invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_id TEXT UNIQUE NOT NULL,
  workspace TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id BIGSERIAL PRIMARY KEY,
  workspace TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.automations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  flow_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Simple sample policies (commented out until you enable RLS)
-- ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "read_all_messages_dev" ON public.messages FOR SELECT USING (true);
-- CREATE POLICY "insert_all_messages_dev" ON public.messages FOR INSERT WITH CHECK (true);

-- You may later tie rows to workspace and user ownership for stricter access.
