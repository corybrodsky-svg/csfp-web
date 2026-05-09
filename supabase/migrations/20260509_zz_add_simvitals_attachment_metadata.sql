alter table if exists public.simvitals_posts
  add column if not exists attachment jsonb null;

comment on column public.simvitals_posts.attachment is
  'SimVitals attachment metadata including file name, storage path, mime type, size, upload timestamp, uploader, and linked event context.';
