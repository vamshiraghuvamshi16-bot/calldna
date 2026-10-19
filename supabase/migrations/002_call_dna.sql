-- CALL DNA: one Decision Fingerprint per call.
-- Run in Supabase > SQL Editor AFTER the Revenue X-Ray tables exist.

drop view if exists call_dna;

create table if not exists call_fingerprints (
  call_id         uuid primary key references calls(id) on delete cascade,
  prospect_id     uuid not null references prospects(id) on delete cascade,
  stage_key       text not null references stages(key),
  concern         text not null,
  prospect_quote  text,
  caller_response text,
  strategy        text not null,
  code            text not null,
  source          text not null default 'rule' check (source in ('llm', 'rule', 'manual')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_fp_stage_concern on call_fingerprints (stage_key, concern);
create index if not exists idx_fp_strategy      on call_fingerprints (strategy);
create index if not exists idx_fp_created       on call_fingerprints (created_at desc);

alter table call_fingerprints enable row level security;

create view call_dna as
select
  f.*,
  s.seq        as turning_seq,
  m.max_seq,
  m.outcome    as prospect_outcome,
  case
    when m.max_seq > s.seq                        then 'progressed'
    when m.max_seq = s.seq and m.outcome = 'lost' then 'stalled'
    else 'open'
  end          as outcome,
  c.started_at,
  c.agent_id
from call_fingerprints f
join stages s             on s.key = f.stage_key
join prospect_max_stage m on m.prospect_id = f.prospect_id
join calls c              on c.id = f.call_id;