import Link from 'next/link'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import ProtocolCapabilitySummary from '@/components/supervisor/ProtocolCapabilitySummary'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const copy = {
  en: { brand: uiCopy('u_95745057f79500bb'), operations: uiCopy('u_99c236fe8d134c0f'), capabilities: uiCopy('u_23c3827d5f49d062'), reviews: uiCopy('u_f24fbad9d666b17b'), boundary: uiCopy('u_250b8ab053560a6e'), protocols: uiCopy('u_71d9151411e5a229'), safety: uiCopy('u_93aa6fb592998d62'), supervisory: uiCopy('u_c83c5f5dd49301a7'), mutating: uiCopy('u_e16874d19dec336b'), safe: uiCopy('u_f79f2be2de7733be') },
  es: { brand: 'Supervisor', operations: 'Centro de operaciones', capabilities: 'Capacidades de protocolo', reviews: 'Revisiones de misiones', boundary: 'Diagnóstico de solo lectura', protocols: 'protocolos', safety: 'clasificados por seguridad', supervisory: 'solo supervisión', mutating: 'declaran capacidad de modificación', safe: 'Solo lectura · sin controles de ejecución' },
  pt: { brand: 'Supervisor', operations: 'Centro de operações', capabilities: 'Capacidades de protocolo', reviews: 'Revisões de missões', boundary: 'Diagnóstico somente leitura', protocols: 'protocolos', safety: 'classificados por segurança', supervisory: 'somente supervisão', mutating: 'declaram capacidade de alteração', safe: 'Somente leitura · sem controles de execução' },
  pl: { brand: 'Nadzorca', operations: 'Centrum operacyjne', capabilities: 'Możliwości protokołów', reviews: 'Przeglądy misji', boundary: 'Diagnostyka tylko do odczytu', protocols: 'protokołów', safety: 'sklasyfikowanych pod kątem bezpieczeństwa', supervisory: 'tylko nadzorczych', mutating: 'deklaruje możliwość modyfikacji', safe: 'Tylko odczyt · bez kontroli wykonania' },
  ru: { brand: 'Супервизор', operations: 'Операционный центр', capabilities: 'Возможности протоколов', reviews: 'Проверки миссий', boundary: 'Диагностика только для чтения', protocols: 'протоколов', safety: 'с классификацией безопасности', supervisory: 'только надзорных', mutating: 'допускают изменение', safe: 'Только чтение · без элементов выполнения' },
} as const

type Lang = keyof typeof copy

export default async function SupervisorLayout({ children }: { children: ReactNode }) {
  const raw = (await cookies()).get('sb_locale')?.value?.slice(0, 2).toLowerCase()
  const lang: Lang = raw && raw in copy ? raw as Lang : 'en'
  const t = copy[lang]
  const links = [
    { href: '/dashboard/supervisor', label: t.operations },
    { href: '/dashboard/supervisor/protocol-capabilities', label: t.capabilities },
    { href: '/dashboard/supervisor/missions/reviews', label: t.reviews },
  ] as const

  return <div>
    <nav aria-label={uiCopy('u_6bb079952a4fd53e')} style={nav}>
      <strong style={brand}>{t.brand}</strong>
      <div style={linksStyle}>{links.map(link => <Link key={link.href} href={link.href} style={item}>{link.label}</Link>)}</div>
      <span style={boundary}>{t.boundary}</span>
    </nav>
    <ProtocolCapabilitySummary labels={{ protocols: t.protocols, safety: t.safety, supervisory: t.supervisory, mutating: t.mutating, safe: t.safe }} />
    {children}
  </div>
}

const nav = { position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 18, padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,.1)', background: 'rgba(5,10,18,.94)', backdropFilter: 'blur(16px)' } as const
const brand = { color: '#fff', fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' } as const
const linksStyle = { display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' } as const
const item = { color: 'rgba(255,255,255,.8)', textDecoration: 'none', fontSize: 12, fontWeight: 700, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)' } as const
const boundary = { color: '#38f2a4', fontSize: 11, fontWeight: 800 } as const