-- Drop users_roles link table; roles now referenced directly from users.role_id
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users_roles'
  ) THEN
    -- Drop dependent constraints if present (defensive)
    BEGIN
      ALTER TABLE IF EXISTS public.users_roles DROP CONSTRAINT IF EXISTS users_roles_user_id_users_id_fk;
    EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN
      ALTER TABLE IF EXISTS public.users_roles DROP CONSTRAINT IF EXISTS users_roles_role_id_roles_list_id_fk;
    EXCEPTION WHEN undefined_object THEN NULL; END;
    DROP TABLE public.users_roles;
  END IF;
END $$;


