'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  eyebrow:       { en: 'AI Website Builder', es: 'Constructor de sitios con IA', pt: 'Construtor de sites com IA', pl: 'Kreator stron z IA', ru: 'ИИ-конструктор сайтов' },
  title:         { en: 'Build Website', es: 'Construir sitio web', pt: 'Criar site', pl: 'Zbuduj stronę', ru: 'Создать сайт' },
  subtitle:      { en: 'Describe your business and we\'ll generate a complete website — then refine it visually with drag & drop.', es: 'Describe tu negocio y generaremos un sitio completo — luego refínalo visualmente con arrastrar y soltar.', pt: 'Descreva seu negócio e geraremos um site completo — depois refine-o visualmente com arrastar e soltar.', pl: 'Opisz swoją firmę, a wygenerujemy kompletną stronę — następnie dopracuj ją wizualnie metodą przeciągnij i upuść.', ru: 'Опишите бизнес — мы создадим сайт, а затем вы доработаете его визуально перетаскиванием.' },
  placeholder:   { en: 'e.g. A cozy Italian restaurant in downtown Chicago specializing in homemade pasta and wood-fired pizza…', es: 'p.ej. Un acogedor restaurante italiano en el centro de Chicago especializado en pasta casera…', pt: 'ex. Um aconchegante restaurante italiano no centro de Chicago especializado em massa artesanal…', pl: 'np. Przytulna włoska restauracja w centrum Chicago specjalizująca się w domowym makaronie…', ru: 'напр. Уютный итальянский ресторан в центре Чикаго, специализирующийся на домашней пасте…' },
  generateBtn:   { en: '✦ Generate website', es: '✦ Generar sitio web', pt: '✦ Gerar site', pl: '✦ Generuj stronę', ru: '✦ Создать сайт' },
  generatingBtn: { en: 'Generating…', es: 'Generando…', pt: 'Gerando…', pl: 'Generowanie…', ru: 'Создание…' },
  publishBtn:    { en: '🚀 Publish site', es: '🚀 Publicar sitio', pt: '🚀 Publicar site', pl: '🚀 Opublikuj stronę', ru: '🚀 Опубликовать сайт' },
  publishingBtn: { en: 'Publishing…', es: 'Publicando…', pt: 'Publicando…', pl: 'Publikowanie…', ru: 'Публикация…' },
  regenerate:    { en: '← Start over', es: '← Volver a empezar', pt: '← Recomeçar', pl: '← Zacznij od nowa', ru: '← Начать заново' },
  viewLive:      { en: 'View live →', es: 'Ver en vivo →', pt: 'Ver ao vivo →', pl: 'Zobacz na żywo →', ru: 'Просмотреть →' },
  previewTitle:  { en: 'AI Preview', es: 'Vista previa IA', pt: 'Pré-visualização IA', pl: 'Podgląd IA', ru: 'Предпросмотр ИИ' },
  editTitle:     { en: 'Visual Editor', es: 'Editor visual', pt: 'Editor visual', pl: 'Edytor wizualny', ru: 'Визуальный редактор' },
  engineTitle:   { en: 'Generation engine', es: 'Motor de generación', pt: 'Motor de geração', pl: 'Silnik generowania', ru: 'Движок генерации' },
  hintLabel:     { en: 'Tips for best results', es: 'Consejos para mejores resultados', pt: 'Dicas para melhores resultados', pl: 'Wskazówki dla najlepszych wyników', ru: 'Советы для лучших результатов' },
  hint1:         { en: 'Include your business name, location, and what makes you unique', es: 'Incluye el nombre de tu negocio, ubicación y qué te hace único', pt: 'Inclua o nome do seu negócio, localização e o que te torna único', pl: 'Podaj nazwę firmy, lokalizację i co Cię wyróżnia', ru: 'Укажите название бизнеса, местоположение и что вас выделяет' },
  hint2:         { en: 'Mention your target audience and main services or products', es: 'Menciona tu público objetivo y principales servicios o productos', pt: 'Mencione seu público-alvo e principais serviços ou produtos', pl: 'Wspomnij o grupie docelowej i głównych usługach lub produktach', ru: 'Упомяните целевую аудиторию и основные услуги или продукты' },
  hint3:         { en: 'Add tone: professional, friendly, bold, minimalist, luxury…', es: 'Agrega tono: profesional, amigable, audaz, minimalista, lujoso…', pt: 'Adicione tom: profissional, amigável, ousado, minimalista, luxuoso…', pl: 'Dodaj ton: profesjonalny, przyjazny, odważny, minimalistyczny, luksusowy…', ru: 'Добавьте тон: профессиональный, дружелюбный, смелый, минималистичный, люксовый…' },
  errConnect:    { en: 'Could not connect. Please try again.', es: 'No se pudo conectar. Inténtalo de nuevo.', pt: 'Não foi possível conectar. Tente novamente.', pl: 'Nie można połączyć. Spróbuj ponownie.', ru: 'Не удалось подключиться. Попробуйте еще раз.' },
  charCount:     { en: 'characters', es: 'caracteres', pt: 'caracteres', pl: 'znaków', ru: 'символов' },
  tabPreview:    { en: 'AI Preview', es: 'Vista previa', pt: 'Pré-visualização', pl: 'Podgląd', ru: 'Предпросмотр' },
  tabEditor:     { en: '✏️ Visual Editor', es: '✏️ Editor visual', pt: '✏️ Editor visual', pl: '✏️ Edytor wizualny', ru: '✏️ Визуальный редактор' },
  editorBadge:   { en: 'Drag & Drop', es: 'Arrastrar y soltar', pt: 'Arrastar e soltar', pl: 'Przeciągnij i upuść', ru: 'Перетаскивание' },
  editorHint:    { en: 'Click any element to edit it. Drag blocks from the right panel to add content.', es: 'Haz clic en cualquier elemento para editarlo. Arrastra bloques del panel derecho para agregar contenido.', pt: 'Clique em qualquer elemento para editá-lo. Arraste blocos do painel direito para adicionar conteúdo.', pl: 'Kliknij dowolny element, aby go edytować. Przeciągnij bloki z prawego panelu, aby dodać treść.', ru: 'Нажмите на любой элемент для редактирования. Перетащите блоки из правой панели для добавления контента.' },
  loadingEditor: { en: 'Loading visual editor…', es: 'Cargando editor visual…', pt: 'Carregando editor visual…', pl: 'Ładowanie edytora wizualnego…', ru: 'Загрузка визуального редактора…' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type StatusStep = { step: string; message: string }
type Tab = 'preview' | 'editor'

// ── GrapesJS CDN loader (no npm dependency) ───────────────────────────────────
const GJS_VERSION = '0.23.2'
const GJS_BLOCKS_VERSION = '1.0.2'
const GJS_CSS = `https://cdn.jsdelivr.net/npm/grapesjs@${GJS_VERSION}/dist/css/grapes.min.css`
const GJS_JS = `https://cdn.jsdelivr.net/npm/grapesjs@${GJS_VERSION}/dist/grapes.min.js`
const GJS_BLOCKS_JS = `https://cdn.jsdelivr.net/npm/grapesjs-blocks-basic@${GJS_BLOCKS_VERSION}/dist/index.js`

function loadStyleOnce(href: string, id: string) {
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function loadScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no document')); return }
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('failed to load ' + src)))
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve() })
    script.addEventListener('error', () => reject(new Error('failed to load ' + src)))
    document.head.appendChild(script)
  })
}

async function loadGrapes(): Promise<{ grapesjs: any; blocksPlugin: any }> {
  loadStyleOnce(GJS_CSS, 'gjs-cdn-css')
  await loadScriptOnce(GJS_JS, 'gjs-cdn-core')
  await loadScriptOnce(GJS_BLOCKS_JS, 'gjs-cdn-blocks-basic')
  const w = window as any
  const grapesjs = w.grapesjs
  const blocksPlugin = w.grapesjsBlocksBasic || w['grapesjs-blocks-basic']
  if (!grapesjs) throw new Error('GrapesJS failed to load from CDN')
  return { grapesjs, blocksPlugin }
}

// ── GrapesJS Visual Editor ────────────────────────────────────────────────────
function GrapesEditor({ html, css, lang }: { html: string; css: string; lang: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let destroyed = false

    async function init() {
      if (!containerRef.current) return
      try {
        // Load GrapesJS from CDN at runtime (no npm dependency required)
        const { grapesjs, blocksPlugin } = await loadGrapes()

        if (destroyed || !containerRef.current) return

        // Clear any previous instance
        if (editorRef.current) {
          editorRef.current.destroy()
          editorRef.current = null
        }

        const editor = grapesjs.init({
          container: containerRef.current,
          height: '100%',
          width: '100%',
          storageManager: false,
          plugins: blocksPlugin ? [blocksPlugin] : [],
          pluginsOpts: blocksPlugin ? { [blocksPlugin as any]: {} } : {},
          components: html || '<section><h1>Your site</h1></section>',
          style: css || '',
          deviceManager: {
            devices: [
              { name: 'Desktop', width: '' },
              { name: 'Tablet',  width: '768px', widthMedia: '992px' },
              { name: 'Mobile',  width: '375px', widthMedia: '480px' },
            ],
          },
          styleManager: {
            sectors: [
              {
                name: 'Typography',
                open: false,
                properties: ['font-family', 'font-size', 'font-weight', 'color', 'line-height', 'text-align'],
              },
              {
                name: 'Layout',
                open: false,
                properties: ['display', 'width', 'height', 'padding', 'margin'],
              },
              {
                name: 'Background',
                open: false,
                properties: ['background-color', 'background-image'],
              },
              {
                name: 'Border',
                open: false,
                properties: ['border', 'border-radius'],
              },
            ],
          },
          // Dark theme via canvas styles
          canvasCss: `
            * { box-sizing: border-box; }
            body { margin: 0; font-family: system-ui, sans-serif; }
            .gjs-selected { outline: 2px solid #1af0ff !important; outline-offset: 2px; }
            .gjs-hovered  { outline: 1px dashed rgba(26,240,255,.5) !important; }
          `,
        })

        // Apply dark panel theme via DOM (GrapesJS doesn't support CSS vars natively)
        const panels = containerRef.current.querySelectorAll<HTMLElement>('.gjs-pn-panels, .gjs-pn-panel')
        panels.forEach(el => {
          el.style.background = 'rgba(15,23,42,.97)'
          el.style.borderColor = 'rgba(255,255,255,.08)'
          el.style.color = '#fff'
        })

        editorRef.current = editor
        setLoading(false)
      } catch (err: any) {
        if (!destroyed) {
          setError('Visual editor failed to load. Please refresh.')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      destroyed = true
      if (editorRef.current) {
        try { editorRef.current.destroy() } catch {}
        editorRef.current = null
      }
    }
  }, [html, css])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fca5a5', fontSize: 14 }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,7,18,.85)', zIndex: 10, borderRadius: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(26,240,255,.2)', borderTopColor: '#1af0ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, margin: 0 }}>{c('loadingEditor', lang)}</p>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BuilderPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [description, setDescription] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [steps, setSteps]             = useState<StatusStep[]>([])
  const [content, setContent]         = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl]         = useState<string | null>(null)
  const [message, setMessage]         = useState('')
  const [activeTab, setActiveTab]     = useState<Tab>('preview')
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (content) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [content])
'console.deploy.onlyReady': ['Only READY deployments can be promoted', 'Solo se pueden promover despliegues READY', 'Apenas implantações READY podem ser promovidas', 'Tylko wdrożenia READY mogą być promowane', 'Продвигать можно только развёртывания READY'],
  'console.deploy.canceling': ['Canceling…', 'Cancelando…', 'Cancelando…', 'Anulowanie…', 'Отмена…'],
  'console.deploy.cancelBuild': ['🛑 Cancel build', '🛑 Cancelar compilación', '🛑 Cancelar build', '🛑 Anuluj kompilację', '🛑 Отменить сборку'],
  'console.deploy.notInProgress': ['Not in progress — nothing to cancel', 'No está en curso — nada que cancelar', 'Não está em andamento — nada a cancelar', 'Nie w toku — nie ma czego anulować', 'Не выполняется — нечего отменять'],
  'console.deploy.liveUrl': ['Live URL', 'URL en vivo', 'URL ao vivo', 'Adres URL na żywo', 'Активный URL'],
  'console.deploy.gitCommit': ['Git Commit', 'Commit de Git', 'Commit do Git', 'Commit Git', 'Git-коммит'],
  'console.deploy.deploymentId': ['Deployment ID', 'ID de despliegue', 'ID da implantação', 'ID wdrożenia', 'ID развёртывания'],
  'console.deploy.created': ['Created', 'Creado', 'Criado', 'Utworzono', 'Создано'],
  'console.deploy.aliases': ['Aliases', 'Alias', 'Aliases', 'Aliasy', 'Псевдонимы'],
  'console.deploy.inspector': ['📊 View Deployment Details in Inspector →', '📊 Ver detalles del despliegue en Inspector →', '📊 Ver detalhes da implantação no Inspector →', '📊 Zobacz szczegóły wdrożenia w Inspektorze →', '📊 Открыть детали развёртывания в Inspector →'],
  'console.deploy.justNow': ['just now', 'ahora mismo', 'agora mesmo', 'przed chwilą', 'только что'],
  'console.deploy.minAgo': ['m ago', ' min', 'min atrás', 'min temu', 'мин назад'],
  'console.deploy.hourAgo': ['h ago', ' h', 'h atrás', 'godz temu', 'ч назад'],
  'console.deploy.dayAgo': ['d ago', ' d', 'd atrás', 'dni temu', 'дн назад'],
  'console.deploy.rollbackVerb': ['Roll back to', 'Revertir a', 'Reverter para', 'Wycofaj do', 'Откатить к'],
  'console.deploy.cancelVerb': ['Cancel build', 'Cancelar compilación', 'Cancelar build', 'Anuluj kompilację', 'Отменить сборку'],
  'console.deploy.rollbackTail': ['This promotes it back to production.', 'Esto lo promueve de nuevo a producción.', 'Isso o promove de volta à produção.', 'To przywróci je do produkcji.', 'Это вернёт его в продакшн.'],
  'console.deploy.cancelTail': ['This aborts the running build.', 'Esto aborta la compilación en curso.', 'Isso aborta o build em execução.', 'To przerwie działającą kompilację.', 'Это прервёт выполняемую сборку.'],
  'console.deploy.rollbackDone': ['Rollback complete', 'Reversión completada', 'Reversão concluída', 'Wycofanie zakończone', 'Откат завершён'],
  'console.deploy.cancelDone': ['Build canceled', 'Compilación cancelada', 'Build cancelado', 'Kompilacja anulowana', 'Сборка отменена'],
  'console.deploy.failedAction': ['Failed to', 'No se pudo', 'Falha ao', 'Nie udało się', 'Не удалось'],
  'console.deploy.errorDuring': ['Error during', 'Error durante', 'Erro durante', 'Błąd podczas', 'Ошибка во время'],
  'console.deploy.err.load': ['Failed to load deployments', 'No se pudieron cargar los despliegues', 'Falha ao carregar implantações', 'Nie udało się załadować wdrożeń', 'Не удалось загрузить развёртывания'],
  'console.deploy.err.loading': ['Error loading deployments', 'Error al cargar despliegues', 'Erro ao carregar implantações', 'Błąd ładowania wdrożeń', 'Ошибка загрузки развёртываний'],
  'console.vault.eyebrow': ['Operations & Production', 'Operaciones y producción', 'Operações e produção', 'Operacje i produkcja', 'Операции и продакшн'],
  'console.vault.title': ['Keys & Secrets', 'Claves y secretos', 'Chaves e segredos', 'Klucze i sekrety', 'Ключи и секреты'],
  'console.vault.subtitle': ['Credential inventory, expiration alerts, and rotation status.', 'Inventario de credenciales, alertas de expiración y estado de rotación.', 'Inventário de credenciais, alertas de expiração e status de rotação.', 'Inwentarz poświadczeń, alerty wygaśnięcia i status rotacji.', 'Инвентарь учётных данных, оповещения об истечении и статус ротации.'],
  'console.vault.secret': ['secret', 'secreto', 'segredo', 'sekret', 'секрет'],
  'console.vault.secrets': ['secrets', 'secretos', 'segredos', 'sekrety', 'секретов'],
  'console.vault.stored': ['stored.', 'almacenados.', 'armazenados.', 'przechowywanych.', 'хранится.'],
  'console.vault.active': ['Active', 'Activos', 'Ativos', 'Aktywne', 'Активные'],
  'console.vault.expiring': ['Expiring', 'Por expirar', 'Expirando', 'Wygasające', 'Истекающие'],
  'console.vault.lock': ['Lock Vault', 'Bloquear vault', 'Bloquear cofre', 'Zablokuj sejf', 'Заблокировать хранилище'],
  'console.vault.browse': ['Browse Secrets', 'Explorar secretos', 'Navegar pelos segredos', 'Przeglądaj sekrety', 'Просмотр секретов'],
  'console.vault.searchProvider': ['Search and select a provider...', 'Busque y seleccione un proveedor...', 'Pesquise e selecione um provedor...', 'Wyszukaj i wybierz dostawcę...', 'Найдите и выберите провайдера...'],
  'console.vault.selected': ['Selected:', 'Seleccionado:', 'Selecionado:', 'Wybrano:', 'Выбрано:'],
  'console.vault.selectPrompt': ['👆 Select a provider above to view its secrets', '👆 Seleccione un proveedor arriba para ver sus secretos', '👆 Selecione um provedor acima para ver seus segredos', '👆 Wybierz dostawcę powyżej, aby zobaczyć jego sekrety', '👆 Выберите провайдера выше, чтобы увидеть его секреты'],
  'console.vault.noSecretsFor': ['No secrets found for', 'No se encontraron secretos para', 'Nenhum segredo encontrado para', 'Nie znaleziono sekretów dla', 'Секреты не найдены для'],
  'console.vault.status.active': ['Active Secrets', 'Secretos activos', 'Segredos ativos', 'Aktywne sekrety', 'Активные секреты'],
  'console.vault.status.expiringSoon': ['Expiring Soon', 'Por expirar pronto', 'Expirando em breve', 'Wkrótce wygasające', 'Скоро истекают'],
  'console.vault.status.expired': ['Expired', 'Expirados', 'Expirados', 'Wygasłe', 'Истёкшие'],
  'console.vault.status.rotated': ['Recently Rotated', 'Rotados recientemente', 'Rotacionados recentemente', 'Niedawno rotowane', 'Недавно ротированные'],
  'console.vault.status.revoked': ['Revoked', 'Revocados', 'Revogados', 'Unieważnione', 'Отозванные'],
  'console.vault.maskedValue': ['Masked Value', 'Valor enmascarado', 'Valor mascarado', 'Wartość zamaskowana', 'Маскированное значение'],
  'console.vault.encryptedNote': ['Full value is encrypted and not displayed in the UI.', 'El valor completo está cifrado y no se muestra en la interfaz.', 'O valor completo é criptografado e não é exibido na interface.', 'Pełna wartość jest zaszyfrowana i nie jest wyświetlana w interfejsie.', 'Полное значение зашифровано и не отображается в интерфейсе.'],
  'console.vault.expiration': ['Expiration', 'Expiración', 'Expiração', 'Wygaśnięcie', 'Истечение'],
  'console.vault.lastRotated': ['Last Rotated', 'Última rotación', 'Última rotação', 'Ostatnia rotacja', 'Последняя ротация'],
  'console.vault.typeEnv': ['Type & Environment', 'Tipo y entorno', 'Tipo e ambiente', 'Typ i środowisko', 'Тип и среда'],
  'console.vault.err.fetch': ['Failed to fetch secrets', 'No se pudieron obtener los secretos', 'Falha ao buscar segredos', 'Nie udało się pobrać sekretów', 'Не удалось получить секреты'],
  'console.vault.err.unknown': ['Unknown error', 'Error desconocido', 'Erro desconhecido', 'Nieznany błąd', 'Неизвестная ошибка'],
  'vault.mfa.op.rotation': ['Rotate this credential', 'Rotar esta credencial', 'Rotacionar esta credencial', 'Rotuj to poświadczenie', 'Ротировать это учётное данное'],
  'vault.mfa.op.revocation': ['Revoke this credential', 'Revocar esta credencial', 'Revogar esta credencial', 'Unieważnij to poświadczenie', 'Отозвать это учётное данное'],
  'vault.mfa.op.export': ['Export this credential', 'Exportar esta credencial', 'Exportar esta credencial', 'Eksportuj to poświadczenie', 'Экспортировать это учётное данное'],
  'vault.mfa.invalidLength': ['Enter a valid code', 'Introduzca un código válido', 'Insira um código válido', 'Wprowadź prawidłowy kod', 'Введите действительный код'],
  'vault.mfa.invalid': ['Invalid code. Please try again.', 'Código inválido. Inténtelo de nuevo.', 'Código inválido. Tente novamente.', 'Nieprawidłowy kod. Spróbuj ponownie.', 'Неверный код. Попробуйте снова.'],
  'vault.mfa.failed': ['Verification failed', 'La verificación falló', 'Falha na verificação', 'Weryfikacja nie powiodła się', 'Проверка не пройдена'],
  'vault.mfa.eyebrow': ['Security Verification', 'Verificación de seguridad', 'Verificação de segurança', 'Weryfikacja bezpieczeństwa', 'Проверка безопасности'],
  'vault.mfa.title': ['Verify Your Identity', 'Verifique su identidad', 'Verifique sua identidade', 'Zweryfikuj swoją tożsamość', 'Подтвердите свою личность'],
  'vault.mfa.method.totp': ['Authenticator App', 'Aplicación de autenticación', 'Aplicativo autenticador', 'Aplikacja uwierzytelniająca', 'Приложение-аутентификатор'],
  'vault.mfa.method.email': ['Email', 'Correo electrónico', 'E-mail', 'E-mail', 'Эл. почта'],
  'vault.mfa.method.sms': ['SMS', 'SMS', 'SMS', 'SMS', 'SMS'],
  'vault.mfa.method.totpDesc': ['Use your authenticator app', 'Use su aplicación de autenticación', 'Use seu aplicativo autenticador', 'Użyj aplikacji uwierzytelniającej', 'Используйте приложение-аутентификатор'],
  'vault.mfa.method.emailDesc': ['Code sent to your email', 'Código enviado a su correo', 'Código enviado para seu e-mail', 'Kod wysłany na e-mail', 'Код отправлен на эл. почту'],
  'vault.mfa.method.smsDesc': ['Code sent to your phone', 'Código enviado a su teléfono', 'Código enviado para seu telefone', 'Kod wysłany na telefon', 'Код отправлен на телефон'],
  'vault.mfa.enterCode': ['Enter 6-digit code', 'Introduzca el código de 6 dígitos', 'Insira o código de 6 dígitos', 'Wprowadź 6-cyfrowy kod', 'Введите 6-значный код'],
  'vault.mfa.verifying': ['Verifying...', 'Verificando...', 'Verificando...', 'Weryfikowanie...', 'Проверка...'],
  'vault.mfa.verify': ['Verify', 'Verificar', 'Verificar', 'Zweryfikuj', 'Проверить'],
  'vault.mfa.success': ['Verified successfully', 'Verificado correctamente', 'Verificado com sucesso', 'Pomyślnie zweryfikowano', 'Успешно подтверждено'],
  'vault.mfa.proceeding': ['Proceeding with operation...', 'Procediendo con la operación...', 'Prosseguindo com a operação...', 'Kontynuowanie operacji...', 'Выполнение операции...'],
  'trust.trustedBy': ['Trusted by', 'Con la confianza de', 'Com a confiança de', 'Zaufali nam', 'Нам доверяют'],
  'credits.usage.title': ['Credit Usage', 'Uso de créditos', 'Uso de créditos', 'Wykorzystanie kredytów', 'Использование кредитов'],
  'credits.usage.used': ['credits used', 'créditos usados', 'créditos usados', 'wykorzystanych kredytów', 'кредитов использовано'],
  'credits.usage.warning': ['Over 80% used. Consider upgrading.', 'Más del 80% usado. Considere mejorar su plan.', 'Mais de 80% usado. Considere fazer upgrade.', 'Wykorzystano ponad 80%. Rozważ ulepszenie planu.', 'Использовано более 80%. Рассмотрите повышение плана.'],
  'credits.usage.autoTopup': ['Auto top-up will add more credits.', 'La recarga automática añadirá más créditos.', 'A recarga automática adicionará mais créditos.', 'Automatyczne doładowanie doda więcej kredytów.', 'Автопополнение добавит больше кредитов.'],
  'credits.usage.limitReached': ['Credit limit reached.', 'Límite de créditos alcanzado.', 'Limite de créditos atingido.', 'Osiągnięto limit kredytów.', 'Достигнут лимит кредитов.'],
  'operator.plan.previewTitle': ['Preview your website', 'Vista previa de su sitio web', 'Pré-visualize seu site', 'Podgląd Twojej strony', 'Предпросмотр вашего сайта'],
  'operator.plan.previewSubtitle': ['This is the content I generated. Approve it to publish your site live.', 'Este es el contenido que generé. Apruébelo para publicar su sitio.', 'Este é o conteúdo que gerei. Aprove para publicar seu site.', 'To jest treść, którą wygenerowałem. Zatwierdź, aby opublikować stronę.', 'Это сгенерированный мной контент. Одобрите, чтобы опубликовать сайт.'],
  'operator.status.title': ['Publish status', 'Estado de publicación', 'Status de publicação', 'Status publikacji', 'Статус публикации'],
  'operator.status.state': ['State:', 'Estado:', 'Estado:', 'Stan:', 'Состояние:'],
  'operator.approve': ['Approve update', 'Aprobar actualización', 'Aprovar atualização', 'Zatwierdź aktualizację', 'Одобрить обновление'],
  'operator.rollback': ['Restore previous version', 'Restaurar versión anterior', 'Restaurar versão anterior', 'Przywróć poprzednią wersję', 'Восстановить предыдущую версию'],
  'footer.brandName': ['SignalBoost AI', 'SignalBoost AI', 'SignalBoost AI', 'SignalBoost AI', 'SignalBoost AI'],
}

const LANGS = ['en', 'es', 'pt', 'pl', 'ru'] as const

export const AUDIT_FIX_COPY: Record<string, Record<string, string>> = {
  en: {}, es: {}, pt: {}, pl: {}, ru: {},
}

for (const [key, vals] of Object.entries(RAW)) {
  LANGS.forEach((lang, i) => {
    AUDIT_FIX_COPY[lang][key] = vals[i]
  })
}
