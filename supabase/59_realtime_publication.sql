-- 59_realtime_publication.sql — School Saathi v157
-- Adds the 9 core synced tables to the supabase_realtime publication so
-- js/modules/realtime.js receives live postgres_changes events per school.
-- Applied live on bsjqeeeemwimzldrehpw (27 Nov 2026). Idempotent.

do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'ss_students','ss_attendance','ss_fee_records','ss_receipts',
      'ss_marks','ss_exams','ss_homework','ss_notices','ss_timetable'
    ])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
