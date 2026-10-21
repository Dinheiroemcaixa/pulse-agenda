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
    className={`relative flex-shrink-0 rounded-xl bg-[#0B132B] border border-white/10 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] flex items-center justify-center ${
      size === 'sm' ? 'w-11 h-11 p-1.5' : 'w-14 h-14 p-2'
    }`}
  >
    <svg
      className="w-full h-full drop-shadow-md"
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
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
        fontFamily="sans-serif"
        fontSize="42"
        fontWeight="900"
        textAnchor="middle"
        x="50"
        y="48"
      >
        $
      </text>
      <path d="M10 45 L50 60 L90 45" fill="none" stroke="#ffffff22" strokeWidth="1.5" />
      <path d="M50 60 V90" fill="none" stroke="#ffffff22" strokeWidth="1.5" />
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
    'w-full h-11 bg-[#0B101B] text-[#F8FAFC] text-sm rounded-lg px-3.5 py-2.5 border border-slate-400/20 placeholder:text-slate-500 transition-all duration-150 focus:outline-none focus:border-[#34D399]/70 focus:ring-2 focus:ring-[#34D399]/15 new-login-input';

  const primaryButtonClass =
    'w-full h-11 bg-[#22C55E] hover:bg-[#16A34A] active:scale-[0.99] text-[#052E16] font-semibold rounded-lg text-sm transition-all duration-150 flex justify-center items-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_8px_24px_-6px_rgba(34,197,94,0.35)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  return (
    <main className="min-h-screen w-full flex flex-col md:flex-row relative overflow-y-auto md:overflow-hidden bg-[#090D16] text-[#F8FAFC] font-body selection:bg-[#22C55E]/30 selection:text-white">
      {/* Atmosfera arquitetônica sutil em Azul-Marinho, Grafite e Esmeralda */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 14% 18%, rgba(30, 58, 138, 0.24) 0%, transparent 46%),
            radial-gradient(circle at 86% 82%, rgba(16, 185, 129, 0.09) 0%, transparent 42%),
            linear-gradient(135deg, #090D16 0%, #0D1424 55%, #0A0F1C 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-35"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
        }}
      />

      {/* Painel Institucional Esquerdo (Desktop / Telas Médias+) com /login-hero.webp */}
      <section className="hidden md:flex flex-col justify-between md:w-[50%] lg:w-[55%] xl:w-[56%] p-10 lg:p-14 xl:p-16 relative z-10 overflow-hidden border-r border-white/[0.06]">
        {/* Imagem Principal de Referência */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src="/login-hero.webp"
            alt="Excelência operacional e gestão financeira Dinheiro em Caixa"
            className="w-full h-full object-cover object-center scale-[1.01] transition-transform duration-700"
          />
          {/* Camada 1: Tonalização azul-marinho sutil */}
          <div className="absolute inset-0 bg-[#081024]/55 mix-blend-multiply" />
          {/* Camada 2: Vinheta vertical superior e inferior preservando nitidez central do selo */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,13,24,0.88)_0%,rgba(10,17,32,0.38)_42%,rgba(10,17,32,0.42)_62%,rgba(8,13,24,0.94)_100%)]" />
          {/* Camada 3: Transição suave na borda direita para integrar com a coluna do formulário */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#090D16]/90" />
        </div>

        {/* Topo: Identidade da Marca sobre faixa superior escura */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandCubeEmblem size="md" />
            <div className="flex flex-col">
              <div className="text-2xl lg:text-3xl font-headline font-bold tracking-tight text-white leading-tight drop-shadow-sm">
                <span>Dinheiro em </span>
                <span className="text-[#34D399]">Caixa</span>
              </div>
              <span className="text-slate-300 text-xs lg:text-sm font-medium tracking-wider uppercase mt-0.5">
                Terceirização Financeira
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full backdrop-blur-md bg-[#0B1221]/80 border border-white/10 text-xs font-medium text-slate-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#34D399] shadow-[0_0_8px_#34D399]" />
            <span className="font-semibold tracking-wide text-white">PULSE AGENDA</span>
          </div>
        </div>

        {/* Centro: Área de respiro limpa para protagonismo do selo holográfico e equipe na foto */}
        <div className="relative z-10 flex-1 min-h-[180px]" aria-hidden="true" />

        {/* Base: Bloco conciso e elegante sobre o gradiente escuro inferior */}
        <div className="relative z-10 max-w-xl space-y-4 pt-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-[#34D399]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              GESTÃO &amp; PRODUTIVIDADE
            </div>
            <h1 className="font-headline text-2xl lg:text-[30px] font-semibold tracking-tight text-white leading-snug drop-shadow-sm">
              Rotinas, prazos e processos padronizados em um único ambiente.
            </h1>
          </div>

          {/* Pílulas discretas com glassmorphism escuro */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-200 backdrop-blur-md bg-[#0B1221]/75 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              Agenda Executiva
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-200 backdrop-blur-md bg-[#0B1221]/75 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
              Procedimentos (POP)
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-200 backdrop-blur-md bg-[#0B1221]/75 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              Controle por Operador
            </span>
          </div>

          {/* Rodapé Institucional Esquerdo */}
          <div className="flex items-center justify-between text-xs text-slate-400/90 pt-4 border-t border-white/10">
            <span>© Dinheiro em Caixa · Ambiente Corporativo</span>
            <span className="text-slate-300 font-medium">Pulse Agenda</span>
          </div>
        </div>
      </section>

      {/* Painel Direito: Protagonismo do Formulário de Acesso */}
      <section className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 lg:p-12 relative z-10 overflow-y-auto">
        <div className="w-full max-w-[430px] my-auto">
          {/* Cabeçalho Compacto de Marca para Mobile / Telas Pequenas (< md) com /login-hero.webp */}
          <div className="flex md:hidden h-28 rounded-2xl overflow-hidden relative mb-5 border border-white/10 shadow-lg">
            <img
              src="/login-hero.webp"
              alt="Excelência operacional e gestão financeira Dinheiro em Caixa"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-[#090F1E]/80 backdrop-blur-[2px]" />
            <div className="relative z-10 w-full h-full px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BrandCubeEmblem size="sm" />
                <div>
                  <div className="text-lg font-headline font-bold text-white leading-tight">
                    Dinheiro em <span className="text-[#34D399]">Caixa</span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium uppercase tracking-wider">
                    Terceirização Financeira
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md bg-[#0B1221]/80 border border-white/10 text-[11px] font-semibold text-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                Pulse Agenda
              </span>
            </div>
          </div>

          {/* Card Principal de Autenticação */}
          <div className="rounded-2xl bg-[#111827]/90 border border-white/[0.08] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl p-6 sm:p-8 space-y-6">
            {/* Seletor Segmentado (Entrar / Cadastrar) ou Retorno no Recuperar Senha */}
            {authTab !== 'recover' ? (
              <div
                className="grid grid-cols-2 p-1 rounded-xl bg-[#0B101B] border border-white/[0.06]"
                role="tablist"
                aria-label="Modo de acesso"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={authTab === 'login'}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer border ${
                    authTab === 'login'
                      ? 'bg-[#182235] text-white border-white/[0.09] shadow-sm'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
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
                  className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer border ${
                    authTab === 'signup'
                      ? 'bg-[#182235] text-white border-white/[0.09] shadow-sm'
                      : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
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
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors bg-transparent border-none cursor-pointer"
                >
                  <span>←</span>
                  <span>Voltar ao login</span>
                </button>
              </div>
            )}

            {/* Título e Subtítulo do Formulário */}
            <header className="space-y-1.5">
              <h2 className="font-headline text-2xl font-semibold tracking-tight text-white">
                {authTab === 'login'
                  ? 'Acesse sua conta'
                  : authTab === 'signup'
                  ? 'Criar nova conta'
                  : 'Redefinir senha'}
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
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
                className="bg-red-950/60 border border-red-500/30 text-red-200 px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                <span>{authErr}</span>
              </div>
            )}

            {/* Corpo do Formulário */}
            {authTab === 'login' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-medium text-slate-300"
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
                      className="block text-xs font-medium text-slate-300"
                      htmlFor="password"
                    >
                      Senha
                    </label>
                    <button
                      type="button"
                      className="text-xs font-medium text-[#34D399] hover:text-[#22C55E] transition-colors border-none bg-transparent cursor-pointer"
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-transparent border-none cursor-pointer"
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
                    <label className="block text-xs font-medium text-slate-300">
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
                    <label className="block text-xs font-medium text-slate-300">
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
                  <label className="block text-xs font-medium text-slate-300">
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
                  <label className="block text-xs font-medium text-slate-300">
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-transparent border-none cursor-pointer"
                    >
                      {showPass ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Cor de identificação no painel
                  </label>
                  <div className="flex flex-wrap gap-2.5 justify-center bg-[#0B101B] border border-white/[0.06] p-3 rounded-lg">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Selecionar cor ${c}`}
                        className={`w-7 h-7 rounded-full transition-transform cursor-pointer border-0 ${
                          sColor === c
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B101B] scale-110'
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
                  <label className="block text-xs font-medium text-slate-300">
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
                  <label className="block text-xs font-medium text-slate-300">
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
                  <label className="block text-xs font-medium text-slate-300">
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-transparent border-none cursor-pointer"
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
            <div className="pt-3 border-t border-white/[0.06] text-center">
              <p className="text-xs text-slate-400">
                {authTab === 'login' ? (
                  <>
                    Ainda não possui acesso?{' '}
                    <button
                      type="button"
                      className="text-[#34D399] font-semibold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer"
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
                      className="text-[#34D399] font-semibold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer"
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
                      className="text-[#34D399] font-semibold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer"
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
          <footer className="mt-6 flex items-center justify-center gap-6 text-[11px] text-slate-500">
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
