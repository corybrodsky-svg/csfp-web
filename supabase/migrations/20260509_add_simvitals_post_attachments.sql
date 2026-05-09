alter table if exists public.simvitals_posts
  add column if not exists attachment jsonb null;

comment on column public.simvitals_posts.attachment is
  'Optional SimVitals post attachment metadata: fileName, path, url, mimeType, size, uploadedAt, uploadedBy.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'simvitals-attachments',
  'simvitals-attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can read SimVitals attachments'
  ) then
    create policy "Authenticated users can read SimVitals attachments"
      on storage.objects for select
      to authenticated
      using (bucket_id = 'simvitals-attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can upload their SimVitals attachments'
  ) then
    create policy "Authenticated users can upload their SimVitals attachments"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'simvitals-attachments'
        and (storage.foldername(name))[1] = 'simvitals'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated users can remove their SimVitals attachments'
  ) then
    create policy "Authenticated users can remove their SimVitals attachments"
      on storage.objects for delete
      to authenticated
      using (
        bucket_id = 'simvitals-attachments'
        and (storage.foldername(name))[1] = 'simvitals'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end;
$$;

comment on table public.simvitals_posts is
  'CFSP SimVitals operational communication feed posts. Optional attachment metadata is stored inline; files live in the private simvitals-attachments storage bucket.';
