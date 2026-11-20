-- SQL 50: grants the photo-url edge function needs (audit v137 follow-up).
-- Run ONLY against the School Saathi project (bsjqeeeemwimzldrehpw).
-- Idempotent: safe to re-run. Already applied live 2026-11-20.
--
-- The function calls the LIVE student login RPC and reads four tables as
-- service_role. SQL 39 revoked the broad public EXECUTE grants and the
-- app tables were never granted to service_role, so every role path in
-- the deployed function failed closed (401/403/404). These grants give
-- the server's OWN backend role exactly what the function reads —
-- nothing is granted to anon or authenticated here, and RLS is untouched
-- (service_role bypasses RLS by design; the function does its own
-- role/school checks before minting anything).
grant execute on function public.ss_student_cloud_login(uuid, text, text) to service_role;
grant select on public.ss_students, public.ss_teachers, public.ss_teacher_sessions, public.ss_schools to service_role;
