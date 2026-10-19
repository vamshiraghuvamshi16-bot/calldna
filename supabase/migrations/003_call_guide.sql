-- Call guide: what the caller sees during a live call.
-- Adds each stage's purpose, what prospects tend to say, and the taps for what happened,
-- plus a table for each stage result and call status/outcome columns.
-- Run after 001 and 002. Safe to run more than once.

alter table stages add column if not exists purpose        text;
alter table stages add column if not exists prospect_lines text[] not null default '{}';
alter table stages add column if not exists result_options jsonb  not null default '[]';

update stages set
  purpose = 'Introduce yourself, confirm who you are speaking to and why they enquired.',
  prospect_lines = array['I just filled the form to get some details.', 'Who is this? Which institute?', 'I am busy right now, can you call later?'],
  result_options = '[{"key":"confirmed","label":"Confirmed interest","tone":"good"},{"key":"call_later","label":"Asked to call back later","tone":"neutral"},{"key":"not_interested","label":"Wrong person or not interested","tone":"bad"}]'
where key = 'enquiry';

update stages set
  purpose = 'Understand their background, goal and timeline before you pitch anything.',
  prospect_lines = array['I am in final year and want a job in data.', 'I am working but want to switch to IT.', 'I am not sure which course suits me.'],
  result_options = '[{"key":"goal_clear","label":"Goal is clear","tone":"good"},{"key":"goal_unsure","label":"Still unsure of their goal","tone":"neutral"},{"key":"not_fit","label":"Not a fit for our courses","tone":"bad"}]'
where key = 'discovery';

update stages set
  purpose = 'Match one course to the goal they told you. Explain what they will learn and build.',
  prospect_lines = array['How is this different from free YouTube courses?', 'Is the syllabus up to date?', 'How long is the course and what are the timings?'],
  result_options = '[{"key":"liked_course","label":"Liked the course","tone":"good"},{"key":"content_questions","label":"Has questions on content","tone":"neutral"},{"key":"not_relevant","label":"Course not relevant","tone":"bad"}]'
where key = 'course_pitch';

update stages set
  purpose = 'Show proof of outcomes: placement support, recent hires, salaries. Be specific and honest.',
  prospect_lines = array['Do you guarantee a job?', 'Which companies hired from your last batch?', 'What salary can I expect?'],
  result_options = '[{"key":"convinced","label":"Convinced by outcomes","tone":"good"},{"key":"wants_proof","label":"Wants proof or references","tone":"neutral"},{"key":"doubts","label":"Doubts the placements","tone":"bad"}]'
where key = 'placement';

update stages set
  purpose = 'Share the fee clearly, then the payment options. Pause and let them react.',
  prospect_lines = array['The fee is too expensive for me.', 'Is there any EMI or discount?', 'I need to ask my parents first.'],
  result_options = '[{"key":"fee_ok","label":"Fee accepted","tone":"good"},{"key":"needs_emi_or_parents","label":"Needs EMI or parents'' approval","tone":"neutral"},{"key":"fee_blocker","label":"Fee is a blocker","tone":"bad"}]'
where key = 'fees';

update stages set
  purpose = 'Ask for the decision. Agree the next step: payment link, seat booking or a follow-up date.',
  prospect_lines = array['Let me think about it.', 'Can you send everything on WhatsApp?', 'Okay, how do I pay?'],
  result_options = '[{"key":"ready","label":"Ready to enrol","tone":"good"},{"key":"follow_up","label":"Follow-up booked","tone":"neutral"},{"key":"said_no","label":"Said no","tone":"bad"}]'
where key = 'closing';

update stages set
  purpose = 'The prospect has paid or booked a seat.'
where key = 'enrolled';

-- Live call details
alter table calls add column if not exists caller_name   text;
alter table calls add column if not exists prospect_name text;
alter table calls add column if not exists status        text not null default 'closed';
alter table calls add column if not exists outcome       text;
alter table calls add column if not exists notes         text;
alter table calls add column if not exists ended_at      timestamptz;

-- One row per stage the caller completed on a call
create table if not exists stage_results (
  id             bigserial primary key,
  call_id        uuid not null references calls(id) on delete cascade,
  stage_key      text not null references stages(key),
  result         text not null,
  prospect_words text,
  created_at     timestamptz not null default now(),
  unique (call_id, stage_key)
);

create index if not exists idx_stage_results_call on stage_results (call_id);
create index if not exists idx_calls_started      on calls (started_at desc);

alter table stage_results enable row level security;
