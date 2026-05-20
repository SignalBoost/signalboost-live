'use client'
import { useState, useEffect } from 'react'
import { inviteMember, removeMember, getTeamMembers, getUserSubscription, PLAN_SEATS } from '@/lib/seats'
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

type Member = {
  id: string
  member_email: string
  role: string
  status: string
  joined_at: string | null
}

export default function TeamManager({ userId }: { userId: string }) {
  const { dict } = useI18n()

  const [members, setMembers] = useState<Member[]>([])
  const [subscription, setSubscription] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [subs, team] = await Promise.all([
      getUserSubscription(userId),
      getTeamMembers(userId),
    ])
    setSubscription(subs)
    setMembers(team as Member[])
  }

  async function handleInvite() {
    if (!email) return
    setLoading(true)
    setMessage('')
    const result = await inviteMember(userId, email)
    if (result.error) {
      setMessage(result.error)
      setMessageType('error')
    } else {
      setMessage(t(dict, 'team.inviteSent', 'Invitation sent!'))
      setMessageType('success')
      setEmail('')
      load()
    }
    setLoading(false)
  }

  async function handleRemove(memberId: string) {
    await removeMember(userId, memberId)
    load()
  }

  const seatsAllowed = subscription ? PLAN_SEATS[subscription.plan] : 1
  const seatsUsed = members.length
  const plan = subscription?.plan || 'free'

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>

      {/* Seats summary */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 24,
      }}>
        <div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{t(dict, 'team.teamSeats', 'Team seats')}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {seatsUsed} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 15 }}>/ {seatsAllowed} {t(dict, 'team.used', 'used')}</span>
          </div>
        </div>
        <div style={{
          background: 'rgba(255,195,0,0.1)', border: '1px solid rgba(255,195,0,0.25)',
          borderRadius: 999, padding: '4px 14px', fontSize: 12, fontWeight: 700,
          color: '#ffc300', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {plan} {t(dict, 'team.planSuffix', 'plan')}
        </div>
      </div>

      {/* Seat progress bar */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 999, height: 6, marginBottom: 24 }}>
        <div style={{
          background: seatsUsed >= seatsAllowed ? '#ef4444' : '#ffc300',
          borderRadius: 999, height: '100%',
          width: `${Math.min((seatsUsed / seatsAllowed) * 100, 100)}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Upgrade prompt if at limit */}
      {seatsUsed >= seatsAllowed && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 24,
          fontSize: 13, color: 'rgba(255,100,100,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{t(dict, 'team.seatLimitReached', 'Seat limit reached. Upgrade to add more team members.')}</span>
          <a href="/pricing" style={{ color: '#ffc300', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>
            {t(dict, 'team.upgrade', 'Upgrade')} →
          </a>
        </div>
      )}

      {/* Invite form */}
      {seatsUsed < seatsAllowed && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t(dict, 'team.emailPlaceholder', 'teammate@email.com')}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '10px 16px',
              fontSize: 14, color: '#fff', outline: 'none',
            }}
          />
          <button onClick={handleInvite} disabled={loading}
            style={{
              background: '#ffc300', color: '#000', fontWeight: 800,
              fontSize: 13, padding: '10px 24px', borderRadius: 10,
              border: 'none', cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}>
            {loading ? t(dict, 'team.sending', 'Sending...') : t(dict, 'team.invite', 'Invite')}
          </button>
        </div>
      )}

      {message && (
        <div style={{
          fontSize: 13, padding: '10px 16px', borderRadius: 10, marginBottom: 16,
          background: messageType === 'success' ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${messageType === 'success' ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: messageType === 'success' ? '#4ade80' : '#f87171',
        }}>
          {message}
        </div>
      )}

      {/* Members list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.length === 0 ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: 24 }}>
            {t(dict, 'team.noMembers', 'No team members yet. Invite someone above.')}
          </div>
        ) : members.map(m => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '12px 16px',
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.member_email}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {m.role} · {m.status}
              </div>
            </div>
            <button onClick={() => handleRemove(m.id)}
              style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#f87171', fontSize: 12, fontWeight: 600,
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              }}>
              {t(dict, 'team.remove', 'Remove')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
