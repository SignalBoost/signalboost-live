'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Certification = {
  certificationId: string
  occurredAt?: string
  completedAt?: string
  status?: 'passed' | 'partial' | 'failed'
  transportProtocol?: string
  checks?: Array<{ id: string; status: string; latencyMs: number; errorCode: string | null }>
  unverifiedDeclaredCapabilities?: string[]
}
type Assignment = {
  assignmentId: string
  use: 'cos_reasoner' | 'builder' | 'specialist'
  profileKey: string
  previousAssignmentId: string | null
  certificationEventId: string
  status: string
  createdAt: string
}
type Profile = {
  key: string
  family: string
  modelId: string
  providerModelId: string
  revision: string | null
  revisionPolicy: string
  tokenizerModelId: string | null
  uses: string[]
  transportProtocols: string[]
  inference: Record<string, string>
  training: Record<string, string>
  durableRegistration: boolean
  binding: null | {
    provider: string
    protocol: string
    credentialConfigured: boolean
    apiVersion: string | null
    timeoutMs: number
    maxCallCostUsd: number
  }
  builtInAdapterAvailable: boolean
  certifiable: boolean
  latestCertification: Certification | null
}
type AssignmentGroup = {
  use: Assignment['use']
  current: Assignment | null
  history: Assignment[]
}
type Inventory = {
  ok: boolean
  registryStrictMode: boolean
  profiles: Profile[]
  assignments: AssignmentGroup[]
  certificationReceipts: Certification[]
  config: {
    durableRegistry: boolean
    serverBootstrapRegistryConfigured: boolean
    serverBootstrapTransportConfigured: boolean
    registrationSource: string
    secretsReturned: false
  }
  error?: string
}

type Locale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<Locale, Record<string, string>> = {
  en: {
    eyebrow:'Platform Models', title:'Model & Provider Console',
    intro:'Register buyer models, keep credentials encrypted, certify real capabilities, and govern assignment or rollback for COS, Builder, and specialists.',
    loading:'Loading model inventory…', unavailable:'Model console unavailable',
    strict:'Strict registered-model routing', enabled:'Enabled', disabled:'Migration compatibility mode',
    registration:'Registration source', durable:'Durable host-neutral registry',
    registerTitle:'Register or update a buyer model', registerNote:'Credentials are encrypted server-side and are never returned to this browser. Updating a credential rotates and deletes the superseded ciphertext.',
    key:'Profile key', family:'Family', model:'Model ID', providerModel:'Provider model ID', revisionPolicy:'Revision policy', revision:'Revision', tokenizer:'Tokenizer ID',
    uses:'Allowed uses', transport:'Transport', provider:'Provider label', endpoint:'HTTPS endpoint', credential:'Provider credential', cost:'Maximum provider cost per call (USD)', timeout:'Timeout (ms)',
    json:'Structured JSON', tools:'Tool calling', streaming:'Streaming', save:'Save registration', saving:'Saving…',
    inventory:'Registered model inventory', adapter:'Adapter', available:'available', hostRequired:'host plug-in required',
    cert:'Certification', none:'No certification receipt', certify:'Run live certification', certifying:'Certifying…',
    spend:'Certification makes bounded live provider calls and may incur charges.',
    checks:'Checks', partial:'Unverified declared capabilities',
    assignments:'Production assignments', assign:'Assign', assigning:'Assigning…', rollback:'Rollback', disabling:'Disabling…', disable:'Disable registration',
    current:'Current', noAssignment:'No durable assignment', history:'Recent assignment history',
    confirmRegister:'Save this model registration and encrypted credential configuration?',
    confirmCert:'Run live certification? This can incur bounded provider charges.',
    confirmAssign:'Activate this exact certified model for this platform role? Cross-model fallback will remain disabled.',
    confirmRollback:'Rollback this role to its previous recorded model assignment?',
    confirmDisable:'Disable this model registration? Active assignments must be rolled back first.',
    saved:'Model registration saved.', assigned:'Model assignment changed.', rolledBack:'Model assignment rolled back.', disabledModel:'Model registration disabled.',
  },
  es: {
    eyebrow:'Modelos de plataforma', title:'Consola de modelos y proveedores',
    intro:'Registra modelos del comprador, cifra credenciales, certifica capacidades reales y controla asignación o reversión para COS, Builder y especialistas.',
    loading:'Cargando modelos…', unavailable:'Consola de modelos no disponible',
    strict:'Enrutamiento estricto de modelos registrados', enabled:'Activado', disabled:'Modo de compatibilidad de migración',
    registration:'Origen del registro', durable:'Registro durable y neutral al host',
    registerTitle:'Registrar o actualizar un modelo', registerNote:'Las credenciales se cifran en el servidor y nunca vuelven al navegador. Al rotarlas se elimina el cifrado anterior.',
    key:'Clave del perfil', family:'Familia', model:'ID del modelo', providerModel:'ID del modelo del proveedor', revisionPolicy:'Política de revisión', revision:'Revisión', tokenizer:'ID del tokenizador',
    uses:'Usos permitidos', transport:'Transporte', provider:'Proveedor', endpoint:'Endpoint HTTPS', credential:'Credencial del proveedor', cost:'Coste máximo por llamada (USD)', timeout:'Tiempo límite (ms)',
    json:'JSON estructurado', tools:'Uso de herramientas', streaming:'Streaming', save:'Guardar registro', saving:'Guardando…',
    inventory:'Inventario de modelos', adapter:'Adaptador', available:'disponible', hostRequired:'requiere plug-in del host',
    cert:'Certificación', none:'Sin certificado', certify:'Ejecutar certificación', certifying:'Certificando…',
    spend:'La certificación realiza llamadas reales limitadas y puede generar cargos.',
    checks:'Pruebas', partial:'Capacidades declaradas no verificadas',
    assignments:'Asignaciones de producción', assign:'Asignar', assigning:'Asignando…', rollback:'Revertir', disabling:'Desactivando…', disable:'Desactivar registro',
    current:'Actual', noAssignment:'Sin asignación durable', history:'Historial reciente',
    confirmRegister:'¿Guardar este registro y su configuración de credencial cifrada?',
    confirmCert:'¿Ejecutar certificación en vivo? Puede generar cargos limitados.',
    confirmAssign:'¿Activar este modelo certificado para este rol? No habrá fallback silencioso a otro modelo.',
    confirmRollback:'¿Revertir este rol a su asignación anterior?',
    confirmDisable:'¿Desactivar este registro? Primero hay que revertir las asignaciones activas.',
    saved:'Registro guardado.', assigned:'Asignación cambiada.', rolledBack:'Asignación revertida.', disabledModel:'Registro desactivado.',
  },
  pt: {
    eyebrow:'Modelos da plataforma', title:'Console de modelos e provedores',
    intro:'Registre modelos do comprador, mantenha credenciais criptografadas, certifique capacidades reais e governe atribuição ou rollback para COS, Builder e especialistas.',
    loading:'Carregando modelos…', unavailable:'Console de modelos indisponível',
    strict:'Roteamento estrito de modelos registrados', enabled:'Ativado', disabled:'Modo de compatibilidade de migração',
    registration:'Origem do registro', durable:'Registro durável e neutro ao host',
    registerTitle:'Registrar ou atualizar um modelo', registerNote:'As credenciais são criptografadas no servidor e nunca retornam ao navegador. Ao rotacionar, o ciphertext anterior é apagado.',
    key:'Chave do perfil', family:'Família', model:'ID do modelo', providerModel:'ID do modelo no provedor', revisionPolicy:'Política de revisão', revision:'Revisão', tokenizer:'ID do tokenizer',
    uses:'Usos permitidos', transport:'Transporte', provider:'Provedor', endpoint:'Endpoint HTTPS', credential:'Credencial do provedor', cost:'Custo máximo por chamada (USD)', timeout:'Timeout (ms)',
    json:'JSON estruturado', tools:'Uso de ferramentas', streaming:'Streaming', save:'Salvar registro', saving:'Salvando…',
    inventory:'Inventário de modelos', adapter:'Adaptador', available:'disponível', hostRequired:'requer plug-in do host',
    cert:'Certificação', none:'Sem certificado', certify:'Executar certificação', certifying:'Certificando…',
    spend:'A certificação faz chamadas reais limitadas e pode gerar cobranças.',
    checks:'Verificações', partial:'Capacidades declaradas não verificadas',
    assignments:'Atribuições de produção', assign:'Atribuir', assigning:'Atribuindo…', rollback:'Rollback', disabling:'Desativando…', disable:'Desativar registro',
    current:'Atual', noAssignment:'Sem atribuição durável', history:'Histórico recente',
    confirmRegister:'Salvar este registro e a configuração de credencial criptografada?',
    confirmCert:'Executar certificação ao vivo? Pode gerar cobranças limitadas.',
    confirmAssign:'Ativar este modelo certificado para este papel? Não haverá fallback silencioso para outro modelo.',
    confirmRollback:'Fazer rollback deste papel para a atribuição anterior?',
    confirmDisable:'Desativar este registro? Atribuições ativas precisam ser revertidas primeiro.',
    saved:'Registro salvo.', assigned:'Atribuição alterada.', rolledBack:'Rollback concluído.', disabledModel:'Registro desativado.',
  },
  pl: {
    eyebrow:'Modele platformy', title:'Konsola modeli i dostawców',
    intro:'Rejestruj modele kupującego, szyfruj dane dostępowe, certyfikuj rzeczywiste możliwości oraz zarządzaj przypisaniem i rollbackiem dla COS, Buildera i specjalistów.',
    loading:'Ładowanie modeli…', unavailable:'Konsola modeli jest niedostępna',
    strict:'Ścisłe routowanie zarejestrowanych modeli', enabled:'Włączone', disabled:'Tryb zgodności migracyjnej',
    registration:'Źródło rejestracji', durable:'Trwały rejestr niezależny od hosta',
    registerTitle:'Zarejestruj lub zaktualizuj model', registerNote:'Dane dostępowe są szyfrowane po stronie serwera i nigdy nie wracają do przeglądarki. Rotacja usuwa poprzedni szyfrogram.',
    key:'Klucz profilu', family:'Rodzina', model:'ID modelu', providerModel:'ID modelu dostawcy', revisionPolicy:'Polityka rewizji', revision:'Rewizja', tokenizer:'ID tokenizera',
    uses:'Dozwolone role', transport:'Transport', provider:'Dostawca', endpoint:'Endpoint HTTPS', credential:'Dane dostępowe dostawcy', cost:'Maksymalny koszt wywołania (USD)', timeout:'Limit czasu (ms)',
    json:'Strukturalny JSON', tools:'Wywołania narzędzi', streaming:'Streaming', save:'Zapisz rejestrację', saving:'Zapisywanie…',
    inventory:'Inwentarz modeli', adapter:'Adapter', available:'dostępny', hostRequired:'wymagany plug-in hosta',
    cert:'Certyfikacja', none:'Brak certyfikatu', certify:'Uruchom certyfikację', certifying:'Certyfikowanie…',
    spend:'Certyfikacja wykonuje ograniczone rzeczywiste wywołania i może naliczyć opłaty.',
    checks:'Kontrole', partial:'Niezweryfikowane zadeklarowane możliwości',
    assignments:'Przypisania produkcyjne', assign:'Przypisz', assigning:'Przypisywanie…', rollback:'Rollback', disabling:'Wyłączanie…', disable:'Wyłącz rejestrację',
    current:'Aktualne', noAssignment:'Brak trwałego przypisania', history:'Ostatnia historia',
    confirmRegister:'Zapisać tę rejestrację i zaszyfrowane dane dostępowe?',
    confirmCert:'Uruchomić certyfikację na żywo? Może naliczyć ograniczone opłaty.',
    confirmAssign:'Aktywować ten certyfikowany model dla tej roli? Nie będzie cichego fallbacku do innego modelu.',
    confirmRollback:'Przywrócić poprzednie przypisanie modelu dla tej roli?',
    confirmDisable:'Wyłączyć rejestrację? Najpierw trzeba wycofać aktywne przypisania.',
    saved:'Rejestracja zapisana.', assigned:'Przypisanie zmienione.', rolledBack:'Rollback zakończony.', disabledModel:'Rejestracja wyłączona.',
  },
  ru: {
    eyebrow:'Модели платформы', title:'Консоль моделей и провайдеров',
    intro:'Регистрируйте модели покупателя, шифруйте учетные данные, сертифицируйте реальные возможности и управляйте назначением/откатом для COS, Builder и специалистов.',
    loading:'Загрузка моделей…', unavailable:'Консоль моделей недоступна',
    strict:'Строгая маршрутизация зарегистрированных моделей', enabled:'Включена', disabled:'Режим совместимости миграции',
    registration:'Источник регистрации', durable:'Долговременный реестр, независимый от хоста',
    registerTitle:'Зарегистрировать или обновить модель', registerNote:'Учетные данные шифруются на сервере и никогда не возвращаются в браузер. При ротации старый шифротекст удаляется.',
    key:'Ключ профиля', family:'Семейство', model:'ID модели', providerModel:'ID модели у провайдера', revisionPolicy:'Политика ревизии', revision:'Ревизия', tokenizer:'ID токенизатора',
    uses:'Разрешенные роли', transport:'Транспорт', provider:'Провайдер', endpoint:'HTTPS endpoint', credential:'Учетные данные провайдера', cost:'Максимальная стоимость вызова (USD)', timeout:'Таймаут (мс)',
    json:'Структурированный JSON', tools:'Вызов инструментов', streaming:'Streaming', save:'Сохранить регистрацию', saving:'Сохранение…',
    inventory:'Реестр моделей', adapter:'Адаптер', available:'доступен', hostRequired:'нужен plug-in хоста',
    cert:'Сертификация', none:'Нет сертификата', certify:'Запустить сертификацию', certifying:'Сертификация…',
    spend:'Сертификация выполняет ограниченные реальные вызовы и может быть платной.',
    checks:'Проверки', partial:'Непроверенные заявленные возможности',
    assignments:'Назначения Production', assign:'Назначить', assigning:'Назначение…', rollback:'Откат', disabling:'Отключение…', disable:'Отключить регистрацию',
    current:'Текущее', noAssignment:'Нет долговременного назначения', history:'Недавняя история',
    confirmRegister:'Сохранить регистрацию и зашифрованные учетные данные?',
    confirmCert:'Запустить живую сертификацию? Возможны ограниченные расходы.',
    confirmAssign:'Активировать эту сертифицированную модель для роли? Скрытого fallback на другую модель не будет.',
    confirmRollback:'Откатить роль к предыдущему назначению модели?',
    confirmDisable:'Отключить регистрацию? Активное назначение сначала нужно откатить.',
    saved:'Регистрация сохранена.', assigned:'Назначение изменено.', rolledBack:'Откат выполнен.', disabledModel:'Регистрация отключена.',
  },
}

const protocols = ['openai_compatible','anthropic_messages','google_generate_content','native_sdk','local_runtime','custom_http'] as const
const uses = ['cos_reasoner','builder','specialist'] as const

function localeOf(value: string): Locale {
  const code = value.toLowerCase().split('-')[0]
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
}
function statusLabel(status?: string) { return status || '—' }
function panelStyle(): React.CSSProperties { return { border:'1px solid #334155', borderRadius:14, padding:20, background:'rgba(15,23,42,.65)' } }
function inputStyle(): React.CSSProperties { return { width:'100%', padding:'9px 10px', borderRadius:8, border:'1px solid #475569', background:'#0f172a', color:'#f8fafc' } }

export default function ModelConsole() {
  const { lang } = useI18n()
  const text = useMemo(() => COPY[localeOf(lang)], [lang])
  const [data, setData] = useState<Inventory | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [running, setRunning] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string,string>>({})
  const [form, setForm] = useState({
    key:'', family:'', modelId:'', providerModelId:'', revisionPolicy:'runtime_owned', revision:'', tokenizerModelId:'',
    protocol:'openai_compatible', provider:'buyer', endpoint:'', credential:'', maxCallCostUsd:'0.10', timeoutMs:'120000',
    structuredJson:true, toolCalling:true, streaming:false,
    cos_reasoner:true, builder:true, specialist:true,
  })

  async function load() {
    setError('')
    const response = await fetch('/api/admin/models', { cache:'no-store' })
    const body = await response.json() as Inventory
    if (!response.ok) throw new Error(body.error || 'model_inventory_load_failed')
    setData(body)
    setSelected(current => {
      const next = { ...current }
      for (const group of body.assignments || []) if (!next[group.use] && group.current?.profileKey) next[group.use] = group.current.profileKey
      return next
    })
  }
  useEffect(() => { load().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }, [])

  async function mutate(payload: Record<string,unknown>, key: string, success: string, allow422 = false) {
    setRunning(key); setError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/models', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok && !(allow422 && response.status === 422)) throw new Error(body.error || 'platform_model_action_failed')
      setNotice(success)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setRunning(null) }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    if (!window.confirm(text.confirmRegister)) return
    const selectedUses = uses.filter(use => form[use])
    await mutate({
      action:'register', confirmMutation:true,
      profile:{
        key:form.key, family:form.family, modelId:form.modelId,
        providerModelId:form.providerModelId || form.modelId,
        revisionPolicy:form.revisionPolicy, revision:form.revision || null,
        tokenizerModelId:form.tokenizerModelId || null,
        uses:selectedUses, transportProtocols:[form.protocol],
        inference:{
          chatCompletion:'validated',
          streaming:form.streaming ? 'validated' : 'not_validated',
          toolCalling:form.toolCalling ? 'validated' : 'not_validated',
          structuredJson:form.structuredJson ? 'validated' : 'not_validated',
        },
        training:{},
      },
      transport:{
        protocol:form.protocol, provider:form.provider, endpoint:form.endpoint || null,
        timeoutMs:Number(form.timeoutMs), maxCallCostUsd:Number(form.maxCallCostUsd),
      },
      credential:form.credential || null, credentialName:'apiKey',
    }, 'register', text.saved)
    setForm(current => ({ ...current, credential:'' }))
  }

  async function certify(profileKey: string) {
    if (!window.confirm(text.confirmCert)) return
    await mutate({ action:'certify', profileKey, confirmSpend:true }, `cert:${profileKey}`, '', true)
  }

  async function assign(group: AssignmentGroup) {
    const profileKey = selected[group.use] || ''
    if (!profileKey || !window.confirm(text.confirmAssign)) return
    await mutate({
      action:'assign', use:group.use, profileKey,
      expectedCurrentAssignmentId:group.current?.assignmentId ?? null,
      confirmActivation:true,
    }, `assign:${group.use}`, text.assigned)
  }

  async function rollback(group: AssignmentGroup) {
    if (!group.current || !window.confirm(text.confirmRollback)) return
    await mutate({
      action:'rollback', use:group.use,
      expectedCurrentAssignmentId:group.current.assignmentId,
      confirmRollback:true,
    }, `rollback:${group.use}`, text.rolledBack)
  }

  async function disable(profileKey: string) {
    if (!window.confirm(text.confirmDisable)) return
    await mutate({ action:'disable', profileKey, confirmMutation:true }, `disable:${profileKey}`, text.disabledModel)
  }

  return <main style={{ maxWidth:1180, margin:'0 auto', padding:'32px 20px', color:'#f8fafc' }}>
    <header style={{ marginBottom:24 }}>
      <p style={{ fontSize:12, fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', color:'#67e8f9' }}>{text.eyebrow}</p>
      <h1 style={{ margin:'8px 0' }}>{text.title}</h1>
      <p style={{ maxWidth:900, color:'#cbd5e1' }}>{text.intro}</p>
    </header>

    {error ? <section role="alert" style={{ border:'1px solid #fb7185', borderRadius:12, padding:16, marginBottom:16 }}><strong>{text.unavailable}</strong><p>{error}</p></section> : null}
    {notice ? <section role="status" style={{ border:'1px solid #4ade80', borderRadius:12, padding:12, marginBottom:16 }}>{notice}</section> : null}
    {!data && !error ? <p>{text.loading}</p> : null}

    {data ? <>
      <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginBottom:20 }}>
        <div style={panelStyle()}><strong>{text.strict}</strong><p>{data.registryStrictMode ? text.enabled : text.disabled}</p></div>
        <div style={panelStyle()}><strong>{text.registration}</strong><p>{text.durable}</p></div>
      </section>

      <form onSubmit={register} style={{ ...panelStyle(), marginBottom:24 }}>
        <h2 style={{ marginTop:0 }}>{text.registerTitle}</h2>
        <p style={{ color:'#94a3b8' }}>{text.registerNote}</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))', gap:12 }}>
          <label>{text.key}<input required value={form.key} onChange={e=>setForm(v=>({...v,key:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.family}<input required value={form.family} onChange={e=>setForm(v=>({...v,family:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.model}<input required value={form.modelId} onChange={e=>setForm(v=>({...v,modelId:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.providerModel}<input value={form.providerModelId} onChange={e=>setForm(v=>({...v,providerModelId:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.revisionPolicy}<select value={form.revisionPolicy} onChange={e=>setForm(v=>({...v,revisionPolicy:e.target.value}))} style={inputStyle()}>
            <option value="runtime_owned">runtime_owned</option><option value="fixed">fixed</option><option value="resolve_and_pin_at_dispatch">resolve_and_pin_at_dispatch</option>
          </select></label>
          <label>{text.revision}<input value={form.revision} onChange={e=>setForm(v=>({...v,revision:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.tokenizer}<input value={form.tokenizerModelId} onChange={e=>setForm(v=>({...v,tokenizerModelId:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.transport}<select value={form.protocol} onChange={e=>setForm(v=>({...v,protocol:e.target.value}))} style={inputStyle()}>{protocols.map(p=><option key={p}>{p}</option>)}</select></label>
          <label>{text.provider}<input required value={form.provider} onChange={e=>setForm(v=>({...v,provider:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.endpoint}<input type="url" value={form.endpoint} onChange={e=>setForm(v=>({...v,endpoint:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.credential}<input type="password" autoComplete="new-password" value={form.credential} onChange={e=>setForm(v=>({...v,credential:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.cost}<input required type="number" min="0" max="10000" step="0.000001" value={form.maxCallCostUsd} onChange={e=>setForm(v=>({...v,maxCallCostUsd:e.target.value}))} style={inputStyle()} /></label>
          <label>{text.timeout}<input required type="number" min="1000" max="300000" value={form.timeoutMs} onChange={e=>setForm(v=>({...v,timeoutMs:e.target.value}))} style={inputStyle()} /></label>
        </div>
        <fieldset style={{ marginTop:16, border:'1px solid #334155', borderRadius:10 }}>
          <legend>{text.uses}</legend>
          {uses.map(use=><label key={use} style={{ marginRight:18 }}><input type="checkbox" checked={form[use]} onChange={e=>setForm(v=>({...v,[use]:e.target.checked}))} /> {use}</label>)}
        </fieldset>
        <fieldset style={{ marginTop:12, border:'1px solid #334155', borderRadius:10 }}>
          <legend>Capabilities</legend>
          <label style={{ marginRight:18 }}><input type="checkbox" checked={form.structuredJson} onChange={e=>setForm(v=>({...v,structuredJson:e.target.checked}))} /> {text.json}</label>
          <label style={{ marginRight:18 }}><input type="checkbox" checked={form.toolCalling} onChange={e=>setForm(v=>({...v,toolCalling:e.target.checked}))} /> {text.tools}</label>
          <label><input type="checkbox" checked={form.streaming} onChange={e=>setForm(v=>({...v,streaming:e.target.checked}))} /> {text.streaming}</label>
        </fieldset>
        <button disabled={running==='register'} type="submit" style={{ marginTop:16, padding:'10px 16px' }}>{running==='register' ? text.saving : text.save}</button>
      </form>

      <section style={{ ...panelStyle(), marginBottom:24 }}>
        <h2 style={{ marginTop:0 }}>{text.assignments}</h2>
        <div style={{ display:'grid', gap:14 }}>
          {data.assignments.map(group => {
            const choices = data.profiles.filter(p => p.durableRegistration && p.uses.includes(group.use) && p.latestCertification && p.latestCertification.status !== 'failed')
            return <div key={group.use} style={{ borderTop:'1px solid #334155', paddingTop:12 }}>
              <strong>{group.use}</strong>
              <p>{text.current}: {group.current ? `${group.current.profileKey} · ${group.current.assignmentId}` : text.noAssignment}</p>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <select value={selected[group.use] || ''} onChange={e=>setSelected(v=>({...v,[group.use]:e.target.value}))} style={{ ...inputStyle(), width:320 }}>
                  <option value="">—</option>{choices.map(p=><option key={p.key} value={p.key}>{p.key}</option>)}
                </select>
                <button disabled={running===`assign:${group.use}`} onClick={()=>assign(group)} type="button">{running===`assign:${group.use}` ? text.assigning : text.assign}</button>
                <button disabled={!group.current?.previousAssignmentId || running===`rollback:${group.use}`} onClick={()=>rollback(group)} type="button">{text.rollback}</button>
              </div>
              {group.history.length ? <details style={{ marginTop:8 }}><summary>{text.history}</summary><ul>{group.history.map(item=><li key={item.assignmentId}>{item.createdAt} · {item.status} · {item.profileKey}</li>)}</ul></details> : null}
            </div>
          })}
        </div>
      </section>

      <h2>{text.inventory}</h2>
      <section style={{ display:'grid', gap:18 }}>
        {data.profiles.map(profile => {
          const cert = profile.latestCertification
          const active = data.assignments.some(group => group.current?.profileKey === profile.key)
          return <article key={profile.key} style={panelStyle()}>
            <div style={{ display:'flex', gap:16, justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap' }}>
              <div><h3 style={{ margin:0 }}>{profile.key}</h3><p>{profile.modelId} · {profile.family}</p></div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" disabled={!profile.certifiable || running===`cert:${profile.key}`} onClick={()=>certify(profile.key)}>{running===`cert:${profile.key}` ? text.certifying : text.certify}</button>
                {profile.durableRegistration ? <button type="button" disabled={active || running===`disable:${profile.key}`} onClick={()=>disable(profile.key)}>{text.disable}</button> : null}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
              <div><strong>{text.uses}</strong><p>{profile.uses.join(', ')}</p></div>
              <div><strong>{text.transport}</strong><p>{profile.binding ? `${profile.binding.provider} · ${profile.binding.protocol}` : '—'}</p></div>
              <div><strong>{text.credential}</strong><p>{profile.binding ? (profile.binding.credentialConfigured ? text.enabled : text.disabled) : '—'}</p></div>
              <div><strong>{text.adapter}</strong><p>{profile.builtInAdapterAvailable ? text.available : text.hostRequired}</p></div>
              <div><strong>{text.cost}</strong><p>{profile.binding ? `$${profile.binding.maxCallCostUsd}` : '—'}</p></div>
              <div><strong>{text.cert}</strong><p>{cert ? statusLabel(cert.status) : text.none}</p></div>
            </div>
            <details><summary>Capabilities</summary><ul>{Object.entries(profile.inference).map(([name,state])=><li key={name}>{name}: {state}</li>)}</ul></details>
            {cert ? <div style={{ marginTop:12 }}>
              <strong>{text.checks}</strong>
              <ul>{(cert.checks || []).map(item=><li key={item.id}>{item.id}: {item.status} · {item.latencyMs} ms{item.errorCode ? ` · ${item.errorCode}` : ''}</li>)}</ul>
              {cert.unverifiedDeclaredCapabilities?.length ? <p><strong>{text.partial}:</strong> {cert.unverifiedDeclaredCapabilities.join(', ')}</p> : null}
            </div> : null}
            {profile.certifiable ? <p style={{ fontSize:12, color:'#fbbf24' }}>{text.spend}</p> : null}
          </article>
        })}
      </section>
    </> : null}
  </main>
}
