-- ==============================================================================
-- MIGRATION SQL: Sessões Administrativas de Teste como Operador (Identidade Real)
-- Módulo: Segurança de Sessão, Transição Efetiva de Identidade e Auditoria
-- Projeto: Pulse Agenda
-- ==============================================================================

-- 1. Atualizar constraint de ações na tabela public.access_audit_logs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'access_audit_logs'
  ) THEN
    ALTER TABLE public.access_audit_logs
      DROP CONSTRAINT IF EXISTS access_audit_logs_action_check;

    ALTER TABLE public.access_audit_logs
      ADD CONSTRAINT access_audit_logs_action_check CHECK (action IN (
        'APPROVE_USER',
        'REJECT_USER',
        'SUSPEND_USER',
        'REACTIVATE_USER',
        'UPDATE_PERMISSIONS',
        'UPDATE_PROFILE',
        'START_OPERATOR_SESSION',
        'END_OPERATOR_SESSION',
        'REJECT_FORGED_SESSION'
      ));
  END IF;
END $$;

-- 2. Tabela dedicada de Sessões Administrativas de Teste como Operador
CREATE TABLE IF NOT EXISTS public.operator_test_sessions (
  session_id text PRIMARY KEY,
  admin_user_id text NOT NULL,
  admin_name text NOT NULL,
  admin_email text NOT NULL,
  operator_user_id text NOT NULL,
  operator_name text NOT NULL,
  operator_email text NOT NULL,
  operator_profile text NOT NULL DEFAULT 'operador',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'revoked')),
  started_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_operator_test_sessions_admin
  ON public.operator_test_sessions(admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_test_sessions_operator
  ON public.operator_test_sessions(operator_user_id, started_at DESC);

ALTER TABLE public.operator_test_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_test_sessions_select_policy" ON public.operator_test_sessions;
CREATE POLICY "operator_test_sessions_select_policy" ON public.operator_test_sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "operator_test_sessions_insert_policy" ON public.operator_test_sessions;
CREATE POLICY "operator_test_sessions_insert_policy" ON public.operator_test_sessions
  FOR INSERT WITH CHECK (
    lower(trim(admin_email)) = 'ramoncardosobiologo@gmail.com'
    OR admin_user_id = 'id_1774288221364_jmcbu'
  );

-- 3. RPC para iniciar sessão real como operador (exclusiva do Desenvolvedor)
CREATE OR REPLACE FUNCTION public.fn_start_operator_test_session(
  p_session_id text,
  p_admin_email text,
  p_target_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin public.users%ROWTYPE;
  v_target public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_admin_email))
    AND (id = 'id_1774288221364_jmcbu' OR lower(trim(email)) = 'ramoncardosobiologo@gmail.com');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACESSO NEGADO: Somente o Desenvolvedor autorizado pode iniciar sessão de teste como operador.';
  END IF;

  SELECT * INTO v_target
  FROM public.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador selecionado não encontrado.';
  END IF;

  IF v_target.id = v_admin.id THEN
    RAISE EXCEPTION 'Operação inválida: Selecione uma conta de operador diferente do próprio Desenvolvedor.';
  END IF;

  INSERT INTO public.operator_test_sessions (
    session_id,
    admin_user_id,
    admin_name,
    admin_email,
    operator_user_id,
    operator_name,
    operator_email,
    operator_profile,
    status,
    started_at
  ) VALUES (
    p_session_id,
    v_admin.id,
    v_admin.name,
    v_admin.email,
    v_target.id,
    v_target.name,
    v_target.email,
    coalesce(v_target.access_profile, 'operador'),
    'active',
    timezone('utc'::text, now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'operator_id', v_target.id,
    'operator_email', v_target.email
  );
END;
$$;

-- 4. RPC para encerrar sessão de teste como operador
CREATE OR REPLACE FUNCTION public.fn_end_operator_test_session(
  p_session_id text,
  p_admin_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin
  FROM public.users
  WHERE lower(trim(email)) = lower(trim(p_admin_email))
    AND (id = 'id_1774288221364_jmcbu' OR lower(trim(email)) = 'ramoncardosobiologo@gmail.com');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACESSO NEGADO: Somente o Desenvolvedor autorizado pode encerrar sessão de teste.';
  END IF;

  UPDATE public.operator_test_sessions
  SET
    status = 'ended',
    ended_at = timezone('utc'::text, now())
  WHERE session_id = p_session_id
    AND admin_user_id = v_admin.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'ended_at', timezone('utc'::text, now())
  );
END;
$$;
