-- SQL 51 (app v140, photo privacy): the photo-url edge function's new
-- staff branch verifies staff sessions and roles with the service_role
-- key, exactly like ss_staff_cloud_login does. That role needs the same
-- explicit SELECT grants SQL 50 gave it for the teacher tables. RLS
-- still applies; nothing here widens what any client role can read.
grant select on public.ss_staff, public.ss_staff_sessions to service_role;
