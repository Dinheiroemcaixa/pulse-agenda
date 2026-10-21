import React, { useState } from 'react';
import { COLORS } from '../lib/utils';

interface LoginViewProps {
  authTab: 'login' | 'signup' | 'recover';
  setAuthTab: (tab: 'login' | 'signup' | 'recover') => void;
  lEmail: string;
  setLEmail: (val: string) => void;
  lPass: string;
  setLPass: (val: string) => void;
  sName: string;
  setSName: (val: string) => void;
  sRole: string;
  setSRole: (val: string) => void;
  sEmail: string;
  setSEmail: (val: string) => void;
  sPass: string;
  setSPass: (val: string) => void;
  sColor: string;
  setSColor: (val: string) => void;
  rEmail: string;
  setREmail: (val: string) => void;
  rName: string;
  setRName: (val: string) => void;
  rPass: string;
  setRPass: (val: string) => void;
  authErr: string;
  setAuthErr: (val: string) => void;
  authLoading2: boolean;
  handleLogin: () => void;
  handleSignup: () => void;
  handleRecover: () => void;
}

const BrandCubeEmblem: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <div
    className={`relative flex-shrink-0 rounded-xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center ${
      size === 'sm' ? 'w-11 h-11 p-1.5' : 'w-14 h-14 p-2'
    }`}
  >
    <svg
      className="w-full h-full drop-shadow-xs"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M50 90 L90 75 L90 45 L50 60 Z" fill="#001B5E" />
      <path d="M50 90 L10 75 L10 45 L50 60 Z" fill="#001B5E" />
      <path d="M10 45 L50 30 L90 45 L50 60 Z" fill="#000d2e" />
      <text
        fill="white"
        fontFamily="sans-serif"
        fontSize="18"
        fontWeight="900"
        transform="matrix(1, 0.35, 0, 1, 18, 68)"
      >
        DC
      </text>
      <text
        fill="#40e56c"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.35))"
        fontFamily="sans-serif"
        fontSize="42"
        fontWeight="900"
        textAnchor="middle"
        x="50"
        y="48"
      >
        $
      </text>
      <path d="M10 45 L50 60 L90 45" fill="none" stroke="#ffffff33" strokeWidth="1.5" />
      <path d="M50 60 V90" fill="none" stroke="#ffffff33" strokeWidth="1.5" />
    </svg>
  </div>
);

export const LoginView: React.FC<LoginViewProps> = ({
  authTab,
  setAuthTab,
  lEmail,
  setLEmail,
  lPass,
  setLPass,
  sName,
  setSName,
  sRole,
  setSRole,
  sEmail,
  setSEmail,
  sPass,
  setSPass,
  sColor,
  setSColor,
  rEmail,
  setREmail,
  rName,
  setRName,
  rPass,
  setRPass,
  authErr,
  setAuthErr,
  authLoading2,
  handleLogin,
  handleSignup,
  handleRecover,
}) => {
  const [showPass, setShowPass] = useState(false);

  const inputBaseClass =
    'w-full h-11 bg-[#F8FAFC] hover:bg-white focus:bg-white text-[#0F172A] text-sm rounded-lg px-3.5 py-2.5 border border-slate-200/95 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 focus:outline-none focus:border-[#16A34A] focus:ring-3 focus:ring-[#16A34A]/15 new-login-input';

  const primaryButtonClass =
    'w-full h-11 bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.99] text-white font-semibold rounded-lg text-sm transition-all duration-150 flex justify-center items-center gap-2 shadow-[0_2px_4px_rgba(22,163,74,0.2),0_8px_20px_-4px_rgba(22,163,74,0.32)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  return (
    <main className="min-h-screen w-full flex flex-col md:flex-row relative overflow-y-auto md:overflow-hidden bg-[#F4F7FB] text-[#0F172A] font-body selection:bg-[#16A34A]/20 selection:text-[#0F172A]">
      {/* Atmosfera arquitetônica sutilíssima clara */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 82% 18%, rgba(255, 255, 255, 0.9) 0%, transparent 48%),
            radial-gradient(circle at 88% 84%, rgba(22, 163, 74, 0.045) 0%, transparent 42%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-45"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(15, 23, 42, 0.025) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(15, 23, 42, 0.025) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
        }}
      />

      {/* Painel Institucional Esquerdo (Desktop / Telas Médias+) com /login-hero.webp emoldurado em tema claro */}
      <section className="hidden md:flex md:p-5 lg:p-6 md:w-[50%] lg:w-[54%] xl:w-[55%] relative z-10">
        <div className="w-full h-full rounded-3xl overflow-hidden border border-slate-200/90 shadow-[0_16px_40px_rgba(15,23,42,0.07)] bg-white relative flex flex-col justify-between p-8 lg:p-11">
          {/* Imagem Principal de Referência com Tratamento Claro Sofisticado */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <img
              src="/login-hero.webp"
              alt="Excelência operacional e gestão financeira Dinheiro em Caixa"
              className="w-full h-full object-cover object-center scale-[1.01] transition-transform duration-700"
            />
            {/* Véu branco translúcido no topo e na base preservando o centro luminoso do selo e equipe */}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.28)_36%,rgba(248,250,252,0.25)_64%,rgba(255,255,255,0.95)_100%)]" />
          </div>

          {/* Topo do Painel Esquerdo */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <BrandCubeEmblem size="md" />
              <div className="flex flex-col">
                <div className="text-2xl lg:text-3xl font-headline font-bold tracking-tight text-[#0F172A] leading-tight">
                  <span>Dinheiro em </span>
                  <span className="text-[#16A34A]">Caixa</span>
                </div>
                <span className="text-[#475569] text-xs lg:text-sm font-semibold tracking-wider uppercase mt-0.5">
                  TERCEIRIZAÇÃO FINANCEIRA
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs font-semibold text-[#0F172A]">
              <span className="w-2 h-2 rounded-full bg-[#16A34A] shadow-[0_0_6px_rgba(22,163,74,0.45)]" />
              <span className="tracking-wide">PULSE AGENDA</span>
            </div>
          </div>

          {/* Centro: Área de respiro limpa para protagonismo do selo tecnológico luminoso e equipe */}
          <div className="relative z-10 flex-1 min-h-[180px]" aria-hidden="true" />

          {/* Base do Painel Esquerdo */}
          <div className="relative z-10 max-w-xl space-y-4 pt-6">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-[#15803D]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                GESTÃO &amp; PRODUTIVIDADE
              </div>
              <h1 className="font-headline text-2xl lg:text-[28px] font-bold tracking-tight text-[#0F172A] leading-snug">
                Rotinas, prazos e processos padronizados em um único ambiente.
              </h1>
            </div>

            {/* Pílulas claras refinadas */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#1E293B] bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                Agenda Executiva
              </span>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#1E293B] bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#001B5E]" />
                Procedimentos (POP)
              </span>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#1E293B] bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                Controle por Operador
              </span>
            </div>

            {/* Rodapé Institucional Esquerdo */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-3.5 border-t border-slate-200/80">
              <span>© Dinheiro em Caixa · Ambiente Corporativo</span>
              <span className="text-[#0F172A] font-semibold">Pulse Agenda</span>
            </div>
          </div>
        </div>
      </section>

      {/* Painel Direito: Protagonismo do Formulário de Acesso em Fundo Claro */}
      <section className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 lg:p-12 relative z-10 overflow-y-auto bg-[#F4F7FB]">
        <div className="w-full max-w-[430px] my-auto">
          {/* Cabeçalho Compacto de Marca para Mobile / Telas Pequenas (< md) em Tema Claro */}
          <div className="flex md:hidden h-28 rounded-2xl overflow-hidden relative mb-5 border border-slate-200/90 bg-white shadow-sm">
            <img
              src="/login-hero.webp"
              alt="Excelência operacional e gestão financeira Dinheiro em Caixa"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-white/82 backdrop-blur-[2px]" />
            <div className="relative z-10 w-full h-full px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BrandCubeEmblem size="sm" />
                <div>
                  <div className="text-lg font-headline font-bold text-[#0F172A] leading-tight">
                    Dinheiro em <span className="text-[#16A34A]">Caixa</span>
                  </div>
                  <div className="text-[11px] text-[#475569] font-semibold uppercase tracking-wider">
                    Terceirização Financeira
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/90 shadow-xs text-[11px] font-semibold text-[#0F172A]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                Pulse Agenda
              </span>
            </div>
          </div>

          {/* Card Principal de Autenticação (Branco Puro, Bordas Discretas e Alto Contraste) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-7 sm:p-9 shadow-[0_18px_45px_-12px_rgba(15,23,42,0.09),0_2px_6px_rgba(15,23,42,0.03)] space-y-6">
            {/* Seletor Segmentado (Entrar / Cadastrar) ou Retorno no Recuperar Senha */}
            {authTab !== 'recover' ? (
              <div
                className="grid grid-cols-2 bg-[#F1F5F9] p-1 rounded-xl border border-slate-200/80"
                role="tablist"
                aria-label="Modo de acesso"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'login'}
                  className={`py-2 text-xs rounded-lg transition-all cursor-pointer border ${
                    authTab === 'login'
                      ? 'bg-white text-[#0F172A] shadow-xs border-slate-200/70 font-semibold'
                      : 'bg-transparent text-[#64748B] border-transparent font-medium hover:text-[#0F172A]'
                  }`}
                  onClick={() => {
                    setAuthTab('login');
                    setAuthErr('');
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'signup'}
                  className={`py-2 text-xs rounded-lg transition-all cursor-pointer border ${
                    authTab === 'signup'
                      ? 'bg-white text-[#0F172A] shadow-xs border-slate-200/70 font-semibold'
                      : 'bg-transparent text-[#64748B] border-transparent font-medium hover:text-[#0F172A]'
                  }`}
                  onClick={() => {
                    setAuthTab('signup');
                    setAuthErr('');
                  }}
                >
                  Cadastrar
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setAuthErr('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D] hover:text-[#166534] transition-colors bg-transparent border-none cursor-pointer"
                >
                  <span>←</span>
                  <span>Voltar ao login</span>
                </button>
              </div>
            )}

            {/* Título e Subtítulo do Formulário */}
            <header className="space-y-1.5">
              <h2 className="font-headline text-[#0F172A] text-2xl font-bold tracking-tight">
                {authTab === 'login'
                  ? 'Acesse sua conta'
                  : authTab === 'signup'
                  ? 'Criar nova conta'
                  : 'Redefinir senha'}
              </h2>
              <p className="text-[#64748B] text-sm leading-relaxed">
                {authTab === 'login'
                  ? 'Insira suas credenciais corporativas para continuar.'
                  : authTab === 'signup'
                  ? 'Preencha seus dados para solicitar acesso ao Pulse Agenda.'
                  : 'Confirme seu e-mail e nome cadastrado para definir uma nova senha.'}
              </p>
            </header>

            {/* Alerta de Erro */}
            {authErr && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0" />
                <span>{authErr}</span>
              </div>
            )}

            {/* Corpo do Formulário */}
            {authTab === 'login' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-semibold text-[#334155]"
                    htmlFor="email"
                  >
                    E-mail corporativo
                  </label>
                  <input
                    className={inputBaseClass}
                    id="email"
                    placeholder="nome@empresa.com.br"
                    type="email"
                    autoComplete="email"
                    value={lEmail}
                    onChange={(e) => setLEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label
                      className="block text-xs font-semibold text-[#334155]"
                      htmlFor="password"
                    >
                      Senha
                    </label>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#15803D] hover:text-[#166534] transition-colors border-none bg-transparent cursor-pointer"
                      onClick={() => {
                        setAuthTab('recover');
                        setAuthErr('');
                      }}
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      className={`${inputBaseClass} pr-16`}
                      id="password"
                      placeholder="Digite sua senha"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={lPass}
                      onChange={(e) => setLPass(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 bg-transparent border-none cursor-pointer transition-colors"
                    >
                      {showPass ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={handleLogin}
                    disabled={authLoading2}
                  >
                    <span>{authLoading2 ? 'Entrando...' : 'Entrar'}</span>
                    <span aria-hidden="true" className="text-base leading-none">
                      →
                    </span>
                  </button>
                </div>
              </div>
            ) : authTab === 'signup' ? (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#334155]">
                      Nome completo
                    </label>
                    <input
                      className={inputBaseClass}
                      placeholder="Seu nome"
                      value={sName}
                      onChange={(e) => setSName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#334155]">
                      Cargo ou função
                    </label>
                    <input
                      className={inputBaseClass}
                      placeholder="Ex: Analista Financeiro"
                      value={sRole}
                      onChange={(e) => setSRole(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#334155]">
                    E-mail
                  </label>
                  <input
                    className={inputBaseClass}
                    type="email"
                    placeholder="nome@empresa.com.br"
                    value={sEmail}
                    onChange={(e) => setSEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#334155]">
                    Senha (mín. 4 caracteres)
                  </label>
                  <div className="relative">
                    <input
                      className={`${inputBaseClass} pr-16`}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Crie uma senha"
                      value={sPass}
                      onChange={(e) => setSPass(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 bg-transparent border-none cursor-pointer transition-colors"
                    >
                      {showPass ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#334155]">
                    Cor de identificação no painel
                  </label>
                  <div className="flex flex-wrap gap-2.5 justify-center bg-[#F8FAFC] border border-slate-200/90 p-3 rounded-lg">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Selecionar cor ${c}`}
                        className={`w-7 h-7 rounded-full transition-transform cursor-pointer border-0 ${
                          sColor === c
                            ? 'ring-2 ring-[#0F172A] ring-offset-2 ring-offset-[#F8FAFC] scale-110'
                            : 'opacity-80 hover:opacity-100 hover:scale-105'
                        }`}
                        style={{ background: c }}
                        onClick={() => setSColor(c)}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={handleSignup}
                    disabled={authLoading2}
                  >
                    <span>{authLoading2 ? 'Cadastrando...' : 'Criar minha conta'}</span>
                    <span aria-hidden="true" className="text-base leading-none">
                      →
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#334155]">
                    E-mail cadastrado
                  </label>
                  <input
                    className={inputBaseClass}
                    type="email"
                    placeholder="nome@empresa.com.br"
                    value={rEmail}
                    onChange={(e) => setREmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#334155]">
                    Nome completo
                  </label>
                  <input
                    className={inputBaseClass}
                    placeholder="Igual ao cadastrado no sistema"
                    value={rName}
                    onChange={(e) => setRName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#334155]">
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      className={`${inputBaseClass} pr-16`}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Digite a nova senha"
                      value={rPass}
                      onChange={(e) => setRPass(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRecover()}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-[11px] font-medium text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 bg-transparent border-none cursor-pointer transition-colors"
                    >
                      {showPass ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={handleRecover}
                    disabled={authLoading2}
                  >
                    <span>{authLoading2 ? 'Redefinindo...' : 'Redefinir Senha'}</span>
                    <span aria-hidden="true" className="text-base leading-none">
                      →
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Alternância rápida de rodapé do Card */}
            <div className="pt-3 border-t border-slate-200/80 text-center">
              <p className="text-xs text-[#64748B]">
                {authTab === 'login' ? (
                  <>
                    Ainda não possui acesso?{' '}
                    <button
                      type="button"
                      className="text-[#15803D] font-semibold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer"
                      onClick={() => {
                        setAuthTab('signup');
                        setAuthErr('');
                      }}
                    >
                      Abra sua conta agora
                    </button>
                  </>
                ) : authTab === 'signup' ? (
                  <>
                    Já possui uma conta?{' '}
                    <button
                      type="button"
                      className="text-[#15803D] font-semibold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer"
                      onClick={() => {
                        setAuthTab('login');
                        setAuthErr('');
                      }}
                    >
                      Fazer login
                    </button>
                  </>
                ) : (
                  <>
                    Lembrou sua senha?{' '}
                    <button
                      type="button"
                      className="text-[#15803D] font-semibold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer"
                      onClick={() => {
                        setAuthTab('login');
                        setAuthErr('');
                      }}
                    >
                      Voltar ao login
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Rodapé Discreto abaixo do Card */}
          <footer className="mt-6 flex items-center justify-center gap-6 text-[11px] text-[#64748B]">
            <span>Dinheiro em Caixa</span>
            <span>•</span>
            <span>Acesso Seguro</span>
            <span>•</span>
            <span>Suporte Interno</span>
          </footer>
        </div>
      </section>
    </main>
  );
};
