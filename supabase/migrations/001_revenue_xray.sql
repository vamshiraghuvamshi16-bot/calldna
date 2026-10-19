-- Revenue X-Ray schema
-- Run in the Supabase SQL editor (or `supabase db push`).
-- If you already have prospects/calls tables, map these columns onto yours
-- and keep the stages, call_stage_events, call_concerns, experiments tables + views.

create extension if not exists pgcrypto;

-- Ordered sales stages. Edit labels/keys to match your call-stage tracker.
create table if not exists stages (
  key   text primary key,
  label text not null,
  seq   int  not null unique
);

insert into stages (key, label, seq) values
  ('enquiry',      'Enquiry',              1),
  ('discovery',    'Needs discovery',      2),
  ('course_pitch', 'Course pitch',         3),
  ('placement',    'Placement discussion', 4),
  ('fees',         'Fees discussion',      5),
  ('closing',      'Closing',              6),
  ('enrolled',     'Enrolled',             7)
on conflict (key) do nothing;

create table if not exists prospects (
  id           uuid primary key default gen_random_uuid(),
  external_ref text,                         -- your CRM id; never a name or phone
  source       text,                         -- 'website', 'referral', 'demo_seed' ...
  created_at   timestamptz not null default now(),
  outcome      text not null default 'open'
               check (outcome in ('open', 'enrolled', 'lost')),
  outcome_at   timestamptz,
  revenue      numeric(12,2) not null default 0
);

create table if not exists calls (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references prospects(id) on delete cascade,
  agent_id     text,
  started_at   timestamptz not null default now(),
  duration_sec int,
  transcript   text,
  analyzed_at  timestamptz
);

-- One row each time a call reaches a stage.
create table if not exists call_stage_events (
  id          bigserial primary key,
  call_id     uuid not null references calls(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  stage_key   text not null references stages(key),
  entered_at  timestamptz not null default now()
);

-- Concerns extracted from transcripts (LLM or keyword rules). Excerpts are redacted.
create table if not exists call_concerns (
  id          bigserial primary key,
  call_id     uuid not null references calls(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  stage_key   text references stages(key),
  category    text not null,   -- fees, placement, parental_approval, timing, course_fit, trust, competitor, other
  excerpt     text,
  source      text not null default 'llm' check (source in ('llm', 'rule', 'manual')),
  created_at  timestamptz not null default now()
);

create table if not exists experiments (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  hypothesis         text,
  change_description text,
  target_stage       text not null references stages(key),
  primary_metric     text not null default 'progression'
                     check (primary_metric in ('progression', 'enrollment')),
  status             text not null default 'running'
                     check (status in ('draft', 'running', 'stopped', 'completed')),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz
);

create table if not exists experiment_assignments (
  experiment_id uuid not null references experiments(id) on delete cascade,
  prospect_id   uuid not null references prospects(id) on delete cascade,
  arm           text not null check (arm in ('control', 'treatment')),
  assigned_at   timestamptz not null default now(),
  primary key (experiment_id, prospect_id)
);

create index if not exists idx_prospects_created     on prospects (created_at);
create index if not exists idx_calls_prospect        on calls (prospect_id);
create index if not exists idx_calls_unanalyzed      on calls (analyzed_at) where analyzed_at is null;
create index if not exists idx_stage_events_prospect on call_stage_events (prospect_id);
create index if not exists idx_concerns_prospect     on call_concerns (prospect_id);
create index if not exists idx_concerns_category     on call_concerns (category);

-- Furthest stage each prospect reached. Enrolled prospects always count as the final stage.
create or replace view prospect_max_stage as
select
  p.id         as prospect_id,
  p.outcome,
  p.created_at,
  p.revenue,
  greatest(
    coalesce(max(s.seq), 1),
    case when p.outcome = 'enrolled' then (select max(seq) from stages) else 1 end
  ) as max_seq
from prospects p
left join call_stage_events e on e.prospect_id = p.id
left join stages s            on s.key = e.stage_key
group by p.id;

-- Lock tables away from the public Supabase API. The backend connects with the
-- database connection string (postgres role), which bypasses RLS.
alter table stages                 enable row level security;
alter table prospects              enable row level security;
alter table calls                  enable row level security;
alter table call_stage_events      enable row level security;
alter table call_concerns          enable row level security;
alter table experiments            enable row level security;
alter table experiment_assignments enable row level security;
