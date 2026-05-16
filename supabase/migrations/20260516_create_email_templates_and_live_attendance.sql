create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  university_name text,
  program_name text,
  subject_template text not null,
  body_template text not null,
  body_format text not null default 'plain_text',
  default_to text,
  default_cc text,
  default_bcc text,
  default_from_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

create index if not exists email_templates_category_idx on public.email_templates (category);
create index if not exists email_templates_active_idx on public.email_templates (is_active);
create unique index if not exists email_templates_seed_identity_idx
  on public.email_templates (lower(name), coalesce(university_name, ''), coalesce(program_name, ''));

drop policy if exists "email templates authenticated read" on public.email_templates;
create policy "email templates authenticated read"
  on public.email_templates
  for select
  to authenticated
  using (
    is_active = true
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('sim_op', 'admin', 'super_admin')
    )
  );

drop policy if exists "email templates operator manage" on public.email_templates;
create policy "email templates operator manage"
  on public.email_templates
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('sim_op', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('sim_op', 'admin', 'super_admin')
    )
  );

insert into public.email_templates (
  name,
  category,
  university_name,
  program_name,
  subject_template,
  body_template,
  body_format,
  default_to,
  default_cc,
  default_bcc,
  default_from_label,
  is_active
)
values
  ('Confirmation Hire', 'confirmation', 'CFSP', '', 'CONFIRMED: {{eventName}} - {{eventDate}}', 'Hello {{spFirstName}},

You are confirmed for the following CFSP simulation event:

Event: {{eventName}}
Date(s): {{eventDates}}
Time: {{eventTime}}
Location / Access: {{eventLocation}}
Case / Role: {{caseName}}

Training Date: {{trainingDate}}
Training Time: {{trainingTime}}
Training Zoom Link: {{trainingZoomLink}}

Please reply as soon as possible if your availability has changed or if any details above look incorrect.

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('SP Availability Poll', 'hiring', 'CFSP', '', 'SP Availability Poll: {{eventName}} - {{eventDate}}', 'SPs,

CFSP is checking availability for the following simulation event:

Event: {{eventName}}
Date / Time: {{eventDate}} · {{eventTime}}
Location / Modality: {{eventLocation}}
Role / Case Need: {{caseName}}

Poll Link: {{pollLink}}

Please respond with your availability as soon as possible. Confirmed details will be sent separately.

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('Availability Poll Closed', 'poll', 'CFSP', '', 'Availability Poll Closed: {{eventName}}', 'Hello,

The availability poll for {{eventName}} is now closed.

CFSP will review responses and send confirmation details to selected SPs.

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '', '{{spEmails}}', '{{senderName}}', true),
  ('Prep for Training', 'training', 'CFSP', '', 'SP Training Prep: {{eventName}} - {{trainingDate}}', 'SPs,

Please prepare for SP training for {{eventName}}.

Training Date: {{trainingDate}}
Training Time: {{trainingTime}}
Training Location / Zoom: {{trainingZoomLink}}
Event Date(s): {{eventDates}}
Event Location / Access: {{eventLocation}}
Case / Role: {{caseName}}

Please review any attached materials before training and let CFSP know if you have questions.

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('Prep for Training SimIQ Summative', 'training', 'CFSP', 'SimIQ', 'SimIQ SP Training Prep: {{eventName}}', 'SPs,

Please prepare for the SimIQ summative event: {{eventName}}.

Training: {{trainingDate}} · {{trainingTime}}
Access: {{trainingZoomLink}}

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('Preparatory Text to SPs', 'training', 'CFSP', '', 'Prep Reminder: {{eventName}}', 'Reminder for {{eventName}}: please review your case/prep materials and confirm arrival/access details. Training/access: {{trainingZoomLink}}', 'plain_text', '', '', '{{spEmails}}', '{{senderName}}', true),
  ('Preparatory Text to SPs SimIQ', 'training', 'CFSP', 'SimIQ', 'SimIQ Prep Reminder: {{eventName}}', 'SimIQ reminder for {{eventName}}: please review instructions and confirm access details. {{trainingZoomLink}}', 'plain_text', '', '', '{{spEmails}}', '{{senderName}}', true),
  ('Link to Recorded SP Training', 'training', 'CFSP', '', '{{eventName}}: Link to Recorded SP Training', 'SPs,

Please review the recorded SP training for {{eventName}}.

Event Date(s): {{eventDates}}
Training Recording / Access: {{trainingZoomLink}}
Faculty / Contact: {{faculty}}

If you were not at training but are reviewing the recording, include the approved review time on your timesheet.

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('Link to Recorded SP Training SimIQ', 'training', 'CFSP', 'SimIQ', 'SimIQ Recorded SP Training: {{eventName}}', 'SPs,

Please review the recorded SimIQ SP training for {{eventName}}.

Recording / Access: {{trainingZoomLink}}

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('Introduction to SP Training Template', 'training', 'CFSP', '', 'Introduction to SP Training: {{eventName}}', 'Hello,

This message introduces the SP training plan for {{eventName}}.

Training: {{trainingDate}} · {{trainingTime}}
Location / Access: {{trainingZoomLink}}

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('SimIQ Prep to SPs', 'training', 'CFSP', 'SimIQ', 'SimIQ Prep: {{eventName}}', 'SPs,

Please review the SimIQ preparation instructions for {{eventName}}.

Event: {{eventName}}
Date: {{eventDate}}
Access: {{trainingZoomLink}}

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('SimIQ faculty/student/SP instructions', 'training', 'CFSP', 'SimIQ', 'SimIQ Instructions: {{eventName}}', 'Hello,

Please see SimIQ instructions for {{eventName}}.

Event Date(s): {{eventDates}}
Access: {{trainingZoomLink}}
Faculty: {{faculty}}

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '{{faculty}}', '{{spEmails}}', '{{senderName}}', true),
  ('SP Cancellation', 'cancellation', 'CFSP', '', 'Cancellation Notice: {{eventName}} - {{eventDate}}', 'Hello {{spFirstName}},

CFSP is writing to cancel or release your assignment for {{eventName}} on {{eventDate}}.

Thank you for your flexibility.

{{generalStaffSignature}}', 'plain_text', '{{senderEmail}}', '', '{{spEmails}}', '{{senderName}}', true),
  ('General Staff Signature', 'signature', 'CFSP', '', 'General Staff Signature', '{{senderName}}
{{senderTitle}}
{{senderEmail}}
{{universityName}} {{programName}}', 'plain_text', '', '', '', '{{senderName}}', true)
on conflict do nothing;

alter table public.event_sps
  add column if not exists event_checked_in_at timestamptz,
  add column if not exists event_attendance_status text not null default 'expected',
  add column if not exists attendance_note text;

create table if not exists public.event_learner_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid null,
  round_id text null,
  room text null,
  learner_name text not null,
  learner_email text null,
  status text not null default 'expected',
  checked_in_at timestamptz null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_learner_attendance_unique_slot
  on public.event_learner_attendance (event_id, coalesce(round_id, ''), coalesce(room, ''), learner_name);

alter table public.event_learner_attendance enable row level security;

drop policy if exists "learner attendance authenticated read" on public.event_learner_attendance;
create policy "learner attendance authenticated read"
  on public.event_learner_attendance
  for select
  to authenticated
  using (true);

drop policy if exists "learner attendance operator manage" on public.event_learner_attendance;
create policy "learner attendance operator manage"
  on public.event_learner_attendance
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('sim_op', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('sim_op', 'admin', 'super_admin')
    )
  );
