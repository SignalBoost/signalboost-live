// saas/components/agency/AgencyStudioModeClient.tsx
'use client'

import { useState } from 'react'
import PublicAgencyClient from './PublicAgencyClient.tsx'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'
import { uiText } from '@/lib/i18n/uiText'

type Props = { copy: AgencyCopy['client'] }
type StudioMode = 'manual' | 'ai'

type ManualDraft = {
  youtubeTitle: string
  youtubeDescription: string
  youtubeCommunityPost: string
  linkedinCompanyPost: string
  linkedinFounderPost: string
  pressReleaseSubject: string
  pressReleaseBody: string
}

const EMPTY_DRAFT: ManualDraft = {
  youtubeTitle: '',
  youtubeDescription: '',
  youtubeCommunityPost: '',
  linkedinCompanyPost: '',
  linkedinFounderPost: '',
  pressReleaseSubject: '',
  pressReleaseBody: '',
}

const TEXT: Record<string, {
  title: string
  body: string
  manual: string
  ai: string
  manualTitle: string
  manualBody: string
  youtube: string
  linkedin: string
  press: string
  publication: string
  email: string
  queue: string
  queuing: string
  queued: string
  error: string
  fields: Record<keyof ManualDraft, string>
}> = {
  en: {
    title: uiText('generatedUi.u_b2758e8dbbef8702'),
    body: uiText('generatedUi.u_ec3b66dba6e69798'),
    manual: uiText('generatedUi.u_5bd9eee19d90aeb4'), ai: uiText('generatedUi.u_3b461b0a317ffb2d'),
    manualTitle: uiText('generatedUi.u_83da2ba6bd13bed7'),
    manualBody: uiText('generatedUi.u_850416cb30e5c25e'),
    youtube: uiText('generatedUi.u_fb7accfff8c6f8ea'), linkedin: uiText('generatedUi.u_dd84425b72da12c6'), press: uiText('generatedUi.u_f5a1f30c9a371afd'),
    publication: uiText('generatedUi.u_eab011ad9ff060aa'), email: uiText('generatedUi.u_baf395782fc066e2'),
    queue: uiText('generatedUi.u_a3f160e4036b511a'), queuing: uiText('generatedUi.u_37255b74c579d359'),
    queued: uiText('generatedUi.u_ddcab6e146df4543'),
    error: uiText('generatedUi.u_d9d688e37d6ff483'),
    fields: {
      youtubeTitle: uiText('generatedUi.u_ff9a9985951b07b6'), youtubeDescription: uiText('generatedUi.u_9d23a14b9a2ae811'), youtubeCommunityPost: uiText('generatedUi.u_ed1705c8817c8b49'),
      linkedinCompanyPost: uiText('generatedUi.u_8b841c7ff24acd03'), linkedinFounderPost: uiText('generatedUi.u_6eec798c9467f769'),
      pressReleaseSubject: uiText('generatedUi.u_848f0ca2c125e4dc'), pressReleaseBody: uiText('generatedUi.u_f69ea3f5d4240cb7'),
    },
  },
  es: {
    title: 'Elige cómo quieres crear esta campaña', body: 'La escritura manual siempre está disponible. La ayuda de IA es opcional.',
    manual: 'Escribir manualmente', ai: 'Usar ayuda de IA', manualTitle: 'Estudio manual de campañas',
    manualBody: 'Escribe y edita cada recurso tú mismo. Nada se genera, publica ni envía automáticamente.',
    youtube: 'YouTube', linkedin: 'LinkedIn', press: 'Comunicado de prensa', publication: 'Nombre de la publicación',
    email: 'Email del editor o periodista', queue: 'Enviar a aprobación del propietario', queuing: 'Enviando…',
    queued: 'Enviado a aprobación del propietario. Nada se enviará hasta ser aprobado.',
    error: 'Añade asunto y cuerpo, nombre de publicación y un email válido.',
    fields: { youtubeTitle: 'Título del video', youtubeDescription: 'Descripción del video', youtubeCommunityPost: 'Publicación de comunidad', linkedinCompanyPost: 'Publicación de empresa', linkedinFounderPost: 'Publicación del fundador', pressReleaseSubject: 'Asunto del email', pressReleaseBody: 'Cuerpo del email' },
  },
  pt: {
    title: 'Escolha como deseja criar esta campanha', body: 'A escrita manual está sempre disponível. A ajuda da IA é opcional.',
    manual: 'Escrever manualmente', ai: 'Usar ajuda da IA', manualTitle: 'Estúdio manual de campanhas',
    manualBody: 'Escreva e edite cada material. Nada é gerado, publicado ou enviado automaticamente.',
    youtube: 'YouTube', linkedin: 'LinkedIn', press: 'Comunicado de imprensa', publication: 'Nome da publicação',
    email: 'E-mail do editor ou jornalista', queue: 'Enviar para aprovação do proprietário', queuing: 'Enviando…',
    queued: 'Enviado para aprovação do proprietário. Nada será enviado antes da aprovação.',
    error: 'Adicione assunto e corpo, nome da publicação e um e-mail válido.',
    fields: { youtubeTitle: 'Título do vídeo', youtubeDescription: 'Descrição do vídeo', youtubeCommunityPost: 'Post da comunidade', linkedinCompanyPost: 'Post da empresa', linkedinFounderPost: 'Post do fundador', pressReleaseSubject: 'Assunto do e-mail', pressReleaseBody: 'Corpo do e-mail' },
  },
  pl: {
    title: 'Wybierz sposób tworzenia kampanii', body: 'Tryb ręczny jest zawsze dostępny. Pomoc AI jest opcjonalna.',
    manual: 'Napisz ręcznie', ai: 'Użyj pomocy AI', manualTitle: 'Ręczne studio kampanii',
    manualBody: 'Samodzielnie napisz i edytuj wszystkie materiały. Nic nie zostanie automatycznie utworzone, opublikowane ani wysłane.',
    youtube: 'YouTube', linkedin: 'LinkedIn', press: 'Informacja prasowa', publication: 'Nazwa publikacji',
    email: 'E-mail redaktora lub dziennikarza', queue: 'Wyślij do akceptacji właściciela', queuing: 'Wysyłanie…',
    queued: 'Wysłano do akceptacji właściciela. Nic nie zostanie wysłane bez akceptacji.',
    error: 'Dodaj temat i treść, nazwę publikacji oraz poprawny adres e-mail.',
    fields: { youtubeTitle: 'Tytuł filmu', youtubeDescription: 'Opis filmu', youtubeCommunityPost: 'Post społeczności', linkedinCompanyPost: 'Post strony firmy', linkedinFounderPost: 'Post założyciela', pressReleaseSubject: 'Temat e-maila', pressReleaseBody: 'Treść e-maila' },
  },
  ru: {
    title: 'Выберите способ создания кампании', body: 'Ручной режим доступен всегда. Помощь ИИ необязательна.',
    manual: 'Написать вручную', ai: 'Использовать ИИ', manualTitle: 'Ручная студия кампаний',
    manualBody: 'Создавайте и редактируйте все материалы сами. Ничего не создаётся, не публикуется и не отправляется автоматически.',
    youtube: 'YouTube', linkedin: 'LinkedIn', press: 'Пресс-релиз', publication: 'Название издания',
    email: 'Email редактора или журналиста', queue: 'Отправить владельцу на утверждение', queuing: 'Отправка…',
    queued: 'Отправлено владельцу на утверждение. До утверждения ничего не будет отправлено.',
    error: 'Добавьте тему и текст, название издания и действительный email.',
    fields: { youtubeTitle: 'Название видео', youtubeDescription: 'Описание видео', youtubeCommunityPost: 'Пост сообщества', linkedinCompanyPost: 'Пост страницы компании', linkedinFounderPost: 'Пост основателя', pressReleaseSubject: 'Тема письма', pressReleaseBody: 'Текст письма' },
  },
}

const fieldStyle = {
  width: '100%', borderRadius: 14, border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.07)', color: '#fff', padding: '12px 14px',
} as const

export default function AgencyStudioModeClient({ copy }: Props) {
  const { lang } = useI18n()
  const t = TEXT[lang] || TEXT.en
  const [mode, setMode] = useState<StudioMode>('manual')
  const [draft, setDraft] = useState<ManualDraft>(EMPTY_DRAFT)
  const [publication, setPublication] = useState('')
  const [editorEmail, setEditorEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'queued' | 'error'>('idle')

  function update(field: keyof ManualDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setStatus('idle')
  }

  async function queuePressRelease() {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(editorEmail.trim())
    if (!draft.pressReleaseSubject.trim() || !draft.pressReleaseBody.trim() || !publication.trim() || !emailOk) {
      setStatus('error')
      return
    }

    setLoading(true)
    setStatus('idle')
    try {
      const response = await fetch('/api/agency/press-dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create', created_by_role: 'staff', source: 'public_agency_manual',
          channel: 'online-newspapers', publication_name: publication.trim(),
          editor_contact: editorEmail.trim(), headline: draft.pressReleaseSubject.trim(),
          article_notes: draft.pressReleaseBody.trim(), force_owner_review: true,
        }),
      })
      const data = await response.json().catch(() => null)
      setStatus(response.ok && data?.campaign ? 'queued' : 'error')
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <section className="sb-page-shell sb-section" aria-label={t.title}>
        <div className="sb-glass" style={{ padding: 24, display: 'grid', gap: 14 }}>
          <div><h2 className="sb-h2" style={{ marginBottom: 6 }}>{t.title}</h2><p className="sb-body" style={{ margin: 0 }}>{t.body}</p></div>
          <div className="sb-cta-row" role="tablist" aria-label={t.title}>
            <button type="button" role="tab" aria-selected={mode === 'manual'} className={mode === 'manual' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('manual')}>{t.manual}</button>
            <button type="button" role="tab" aria-selected={mode === 'ai'} className={mode === 'ai' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('ai')}>{t.ai}</button>
          </div>
        </div>
      </section>

      {mode === 'ai' ? <PublicAgencyClient copy={copy} /> : (
        <section className="sb-page-shell sb-section" aria-label={t.manualTitle}>
          <div className="sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
            <div><span className="sb-eyebrow">{t.manual}</span><h2 className="sb-h2">{t.manualTitle}</h2><p className="sb-body">{t.manualBody}</p></div>
            {([
              [t.youtube, ["youtubeTitle", "youtubeDescription", "youtubeCommunityPost"]],
              [t.linkedin, ["linkedinCompanyPost", "linkedinFounderPost"]],
              [t.press, ["pressReleaseSubject", "pressReleaseBody"]],
            ] as const).map(([section, fields]) => (
              <section className="sb-card" style={{ padding: 18, display: 'grid', gap: 12 }} key={section}>
                <h3 className="sb-h3" style={{ margin: 0 }}>{section}</h3>
                {fields.map((field) => (
                  <label key={field} style={{ display: 'grid', gap: 6 }}>
                    <span className="sb-caption">{t.fields[field]}</span>
                    <textarea value={draft[field]} onChange={(event) => update(field, event.target.value)} rows={field === 'pressReleaseBody' || field === 'youtubeDescription' ? 6 : 3} maxLength={field === 'pressReleaseBody' ? 10000 : 3000} style={{ ...fieldStyle, resize: 'vertical' }} />
                  </label>
                ))}
              </section>
            ))}
            <section className="sb-card" style={{ padding: 18, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}><span className="sb-caption">{t.publication}</span><input value={publication} onChange={(event) => { setPublication(event.target.value); setStatus('idle') }} style={fieldStyle} maxLength={140} /></label>
                <label style={{ display: 'grid', gap: 6 }}><span className="sb-caption">{t.email}</span><input value={editorEmail} onChange={(event) => { setEditorEmail(event.target.value); setStatus('idle') }} style={fieldStyle} maxLength={200} type="email" /></label>
              </div>
              <div className="sb-cta-row"><button type="button" className="sb-button-primary" onClick={queuePressRelease} disabled={loading}>{loading ? t.queuing : t.queue}</button></div>
              {status === 'queued' ? <p className="sb-body" style={{ color: '#86efac', margin: 0 }}>{t.queued}</p> : null}
              {status === 'error' ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{t.error}</p> : null}
            </section>
          </div>
        </section>
      )}
    </div>
  )
}
