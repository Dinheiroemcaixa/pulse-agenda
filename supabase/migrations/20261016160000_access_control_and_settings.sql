-- ==============================================================================
-- MIGRATION SQL (PARA REVISÃO — NÃO EXECUTADA AUTOMATICAMENTE EM PRODUÇÃO)
-- Módulo: Configurações, Controle de Acesso por Aprovação e Auditoria
-- Projeto: Pulse Agenda (branch modernizacao-v3)
-- ==============================================================================

-- 1. Adicionar colunas de controle de acesso na tabela public.users (aditivo e seguro)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS access_profile text NOT NULL DEFAULT 'operador'
    CHECK (access_profile IN ('programador', 'gestora', 'operador')),
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'pending'
    CHECK (access_status IN ('active', 'pending', 'suspended', 'rejected')),
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{
    "tasks": true,
    "atrasadas": true,
    "history": true,
    "pops": true,
    "team": false,
    "meetings": true,
    "messages": true,
    "backup": false,
    "settings": false,
    "view_all_tasks": false,
    "create_pops": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz DEFAULT timezone('utc'::text, now());

-- 2. Preservar integralmente os usuários existentes e reconhecer o Programador Principal
-- Programador Principal: RAMON CARDOSO (ramoncardosobiologo@gmail.com / id_1774288221364_jmcbu)
UPDATE public.users
SET
  access_profile = 'programador',
  access_status = 'active',
  is_admin = true,
  permissions = '{
    "tasks": true,
    "atrasadas": true,
    "history": true,
    "pops": true,
    "team": true,
    "meetings": true,
    "messages": true,
    "backup": true,
    "settings": true,
    "view_all_tasks": true,
    "create_pops": true
  }'::jsonb,
  approved_by = 'SYSTEM_BOOTSTRAP',
  approved_at = timezone('utc'::text, now()),
  status_updated_at = timezone('utc'::text, now())
WHERE id = 'id_1774288221364_jmcbu' OR lower(trim(email)) = 'ramoncardosobiologo@gmail.com';

-- Gestora: RAFFAELA LIMA (raffaelabatistalima1@gmail.com / id_1774293514208_f6g52)
UPDATE public.users
SET
  access_profile = 'gestora',
  access_status = 'active',
  is_admin = true,
  permissions = '{
    "tasks": true,
    "atrasadas": true,
    "history": true,
    "pops": true,
    "team": true,
    "meetings": true,
    "messages": true,
    "backup": true,
    "settings": false,
    "view_all_tasks": true,
    "create_pops": true
  }'::jsonb,
  approved_by = 'RAMON CARDOSO',
  approved_at = timezone('utc'::text, now()),
  status_updated_at = timezone('utc'::text, now())
WHERE id = 'id_1774293514208_f6g52' OR lower(trim(email)) = 'raffaelabatistalima1@gmail.com';

-- Operadores existentes preservados como ativos
UPDATE public.users
SET
  access_profile = 'operador',
  access_status = 'active',
  is_admin = false,
  permissions = '{
    "tasks": true,
    "atrasadas": true,
    "history": true,
    "pops": true,
    "team": false,
    "meetings": true,
    "messages": true,
    "backup": false,
    "settings": false,
    "view_all_tasks": false,
    "create_pops": false
  }'::jsonb,
  approved_by = 'RAMON CARDOSO',
  approved_at = timezone('utc'::text, now()),
  status_updated_at = timezone('utc'::text, now())
WHERE lower(trim(email)) IN (
  'geovanarayssamoraisfernandes@gmail.com',
  'andressabrandao022@gmail.com',
  'monarageovana.cardoso@gmail.com'
);

-- 3. Tabela de Histórico Administrativo (Auditoria Imutável)
CREATE TABLE IF NOT EXISTS public.access_audit_logs (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  actor_email text NOT NULL,
  target_user_id text NOT NULL,
  target_user_name text NOT NULL,
  target_user_email text NOT NULL,
  action text NOT NULL CHECK (action IN (
    'APPROVE_USER',
    'REJECT_USER',
    'SUSPEND_USER',
    'REACTIVATE_USER',
    'UPDATE_PERMISSIONS',
    'UPDATE_PROFILE'
  )),
  details text NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_access_audit_logs_created_at
  ON public.access_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_logs_target
  ON public.access_audit_logs(target_user_id);

ALTER TABLE public.access_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_audit_logs_select_policy" ON public.access_audit_logs;
CREATE POLICY "access_audit_logs_select_policy" ON public.access_audit_logs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "access_audit_logs_insert_policy" ON public.access_audit_logs;
CREATE POLICY "access_audit_logs_insert_policy" ON public.access_audit_logs
  FOR INSERT WITH CHECK (
    lower(trim(actor_email)) = 'ramoncardosobiologo@gmail.com'
    OR actor_id = 'id_1774288221364_jmcbu'
  );

-- 4. Trigger de proteção contra auto-aprovação, escalada de privilégios e alteração do Programador
CREATE OR REPLACE FUNCTION public.fn_protect_user_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin_rpc boolean := coalesce(current_setting('app.admin_rpc_authorized', true), 'false') = 'true';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Novos cadastros entram obrigatoriamente como Pendentes e perfil Operador
    IF NOT v_is_admin_rpc THEN
      NEW.access_profile := 'operador';
      NEW.access_status := 'pending';
      NEW.is_admin := false;
      NEW.permissions := '{
        "tasks": true,
        "atrasadas": true,
        "history": true,
        "pops": true,
        "team": false,
        "meetings": true,
        "messages": true,
        "backup": false,
        "settings": false,
        "view_all_tasks": false,
        "create_pops": false
      }'::jsonb;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Proteger conta do Programador Principal contra rebaixamento ou suspensão
    IF OLD.id = 'id_1774288221364_jmcbu' OR lower(trim(OLD.email)) = 'ramoncardosobiologo@gmail.com' THEN
      NEW.access_profile := 'programador';
      NEW.access_status := 'active';
      NEW.is_admin := true;
    END IF;

    -- Impedir que usuários comuns alterem o próprio perfil de acesso, situação ou permissões sem RPC administrativa
    IF NOT v_is_admin_rpc THEN
      NEW.access_profile := OLD.access_profile;
      NEW.access_status := OLD.access_status;
      NEW.permissions := OLD.permissions;
      NEW.is_admin := OLD.is_admin;
      NEW.approved_by := OLD.approved_by;
      NEW.approved_at := OLD.approved_at;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.id = 'id_1774288221364_jmcbu' OR lower(trim(OLD.email)) = 'ramoncardosobiologo@gmail.com' THEN
      RAISE EXCEPTION 'Operação bloqueada: a conta do Programador principal não pode ser removida.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_security_fields ON public.users;
CREATE TRIGGER trg_protect_user_security_fields
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_user_security_fields();

-- 5. RPC Administrativa Exclusiva do Programador Principal
CREATE OR REPLACE FUNCTION public.fn_admin_manage_user_access(
  p_actor_email text,
  p_target_user_id text,
  p_access_profile text,
  p_access_status text,
  p_permissions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_actor
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_actor_email))
    AND (id = 'id_1774288221364_jmcbu' OR lower(trim(email)) = 'ramoncardosobiologo@gmail.com')
    AND access_status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACESSO NEGADO: Somente o Programador principal pode administrar acessos e permissões.';
  END IF;

  SELECT * INTO v_target FROM public.users WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário alvo não encontrado.';
  END IF;

  IF (v_target.id = 'id_1774288221364_jmcbu' OR lower(trim(v_target.email)) = 'ramoncardosobiologo@gmail.com')
     AND (p_access_profile <> 'programador' OR p_access_status <> 'active') THEN
    RAISE EXCEPTION 'Operação proibida: O Programador principal não pode ser suspenso ou despromovido.';
  END IF;

  PERFORM set_config('app.admin_rpc_authorized', 'true', true);

  UPDATE public.users
  SET
    access_profile = p_access_profile,
    access_status = p_access_status,
    permissions = p_permissions,
    is_admin = (p_access_status = 'active' AND p_access_profile IN ('programador', 'gestora')),
    approved_by = CASE WHEN p_access_status = 'active' THEN v_actor.name ELSE approved_by END,
    approved_at = CASE WHEN p_access_status = 'active' THEN coalesce(approved_at, timezone('utc'::text, now())) ELSE approved_at END,
    status_updated_at = timezone('utc'::text, now())
  WHERE id = p_target_user_id;

  RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id);
END;
$$;
