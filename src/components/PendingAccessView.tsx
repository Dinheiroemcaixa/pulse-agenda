import React, { useState } from 'react'
import type { User } from '../types'
import { getInitials } from '../lib/utils'

interface PendingAccessViewProps {
  user: User
  onRefresh: () => Promise<void>
  onLogout: () => void
}

export const PendingAccessView: React.FC<PendingAccessViewProps> = ({
  user,
  onRefresh,
  onLogout,
}) => {
  const [checking, setChecking] = useState(false)
  const status = user.access_status || 'pending'

  const handleCheck = async () => {
    setChecking(true)
    await onRefresh()
    setTimeout(() => setChecking(false), 400)
  }

  const statusConfig = {
    pending: {
      badge: 'Pendente de Aprovação',
      badgeBg: 'rgba(255, 169, 77, 0.14)',
      badgeColor: '#ffa94d',
      badgeBorder: 'rgba(255, 169, 77, 0.35)',
      icon: '⏳',
      title: 'Seu cadastro aguarda liberação',
      description:
        'Sua solicitação de acesso ao Pulse Agenda foi registrada com sucesso e está pendente de aprovação pelo administrador do sistema.',
      subtext:
        'Enquanto o cadastro estiver pendente, os módulos internos, tarefas e dados da equipe permanecem bloqueados por segurança.',
    },
    suspended: {
      badge: 'Acesso Suspenso',
      badgeBg: 'rgba(255, 77, 109, 0.14)',
      badgeColor: '#ff4d6d',
      badgeBorder: 'rgba(255, 77, 109, 0.35)',
      icon: '🔒',
      title: 'Acesso temporariamente suspenso',
      description:
        'Sua conta está com o acesso suspenso pelo administrador do sistema. Seu histórico de atividades permanece preservado.',
      subtext:
        'Caso precise de reativação, entre em contato com o administrador responsável pelo Pulse Agenda.',
    },
    rejected: {
      badge: 'Solicitação Não Aprovada',
      badgeBg: 'rgba(255, 77, 109, 0.14)',
      badgeColor: '#ff4d6d',
      badgeBorder: 'rgba(255, 77, 109, 0.35)',
      icon: '🚫',
      title: 'Solicitação de cadastro recusada',
      description:
        'Seu pedido de acesso ao Pulse Agenda não foi autorizado pelo administrador principal.',
      subtext:
        'Entre em contato com a gestão caso acredite que houve um engano.',
    },
    active: {
      badge: 'Ativo',
      badgeBg: 'rgba(61, 214, 140, 0.14)',
      badgeColor: '#3dd68c',
      badgeBorder: 'rgba(61, 214, 140, 0.35)',
      icon: '✅',
      title: 'Acesso liberado',
      description: 'Seu acesso já foi aprovado.',
      subtext: 'Clique em atualizar para entrar no aplicativo.',
    },
  }[status]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 28px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: user.color || '#4f6ef7',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 800,
            margin: '0 auto 16px',
            boxShadow: `0 0 0 4px ${(user.color || '#4f6ef7')}33`,
          }}
        >
          {getInitials(user.name)}
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: statusConfig.badgeBg,
            color: statusConfig.badgeColor,
            border: `1px solid ${statusConfig.badgeBorder}`,
            marginBottom: 14,
          }}
        >
          <span>{statusConfig.icon}</span>
          <span>{statusConfig.badge}</span>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px', color: 'var(--text)' }}>
          {statusConfig.title}
        </h2>

        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 12px' }}>
          {statusConfig.description}
        </p>

        <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, margin: '0 0 22px' }}>
          {statusConfig.subtext}
        </p>

        <div
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 24,
            textAlign: 'left',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text3)' }}>Usuário:</span>
            <strong style={{ color: 'var(--text)' }}>{user.name}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text3)' }}>E-mail:</span>
            <span style={{ color: 'var(--text2)' }}>{user.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text3)' }}>Cargo informado:</span>
            <span style={{ color: 'var(--text2)' }}>{user.role || 'Operador'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {status === 'pending' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleCheck}
              disabled={checking}
              style={{ flex: 1, height: 40 }}
            >
              {checking ? 'Verificando...' : '🔄 Verificar liberação'}
            </button>
          )}
          <button
            type="button"
            className="bcancel"
            onClick={onLogout}
            style={{ flex: 1, height: 40 }}
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
