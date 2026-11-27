-- 61_school_code.sql (v166): Private School Code login for Student, Parent, Teacher & Staff.
-- Each school gets a unique, short uppercase code (e.g. SS-4821).
-- Users enter their School Code instead of seeing a public list of all schools.

ALTER TABLE public.ss_schools
  ADD COLUMN IF NOT EXISTS school_code text;

CREATE OR REPLACE FUNCTION public.ss_gen_school_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := 'SS-';
    FOR i IN 1..4 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.ss_schools WHERE upper(school_code) = code
    );
  END LOOP;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION public.ss_gen_school_code() FROM PUBLIC, anon, authenticated;

UPDATE public.ss_schools
SET school_code = public.ss_gen_school_code()
WHERE school_code IS NULL OR trim(school_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS ss_schools_code_uniq
  ON public.ss_schools (upper(school_code));

CREATE OR REPLACE FUNCTION public.ss_schools_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.school_code IS NULL OR trim(NEW.school_code) = '' THEN
    NEW.school_code := public.ss_gen_school_code();
  ELSE
    NEW.school_code := upper(trim(NEW.school_code));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ss_schools_assign_code() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ss_schools_assign_code'
  ) THEN
    CREATE TRIGGER trg_ss_schools_assign_code
      BEFORE INSERT ON public.ss_schools
      FOR EACH ROW
      EXECUTE FUNCTION public.ss_schools_assign_code();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ss_resolve_school_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
  v_row record;
BEGIN
  IF length(v_code) < 3 OR length(v_code) > 24 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT id, name, school_code
    INTO v_row
    FROM public.ss_schools
   WHERE upper(school_code) = v_code
     AND coalesce(is_demo, false) = false
     AND trim(coalesce(name, '')) <> ''
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name, 'school_code', v_row.school_code);
END;
$$;

REVOKE ALL ON FUNCTION public.ss_resolve_school_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_resolve_school_code(text) TO anon, authenticated;
