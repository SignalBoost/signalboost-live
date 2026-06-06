'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { detectLanguage } from '@/lib/i18n/detectLanguage'

type Dict = Record<string, string>
type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const dictionaries: Record<Lang, Dict> = {
  en: {
    'nav.home': 'Home', 'nav.podcasters': 'Podcasters', 'nav.pricing': 'Pricing', 'nav.docs': 'Docs', 'nav.dashboard': 'Dashboard',
    'nav.promote': 'Promote Business', 'nav.reviews': 'Reviews', 'nav.calendar': 'Calendar', 'nav.spreadsheets': 'Spreadsheets', 'nav.outreach': 'Outreach', 'nav.assistant': 'Personal Assistant',
    'landing.kicker': 'Native multilingual growth', 'landing.title': 'SignalBoost builds websites, reviews, audio, and video for every market.', 'landing.subtitle': 'Launch localized marketing workflows across English, Spanish, Portuguese, Polish, and Russian with English fallback.',
    'landing.cta': 'Open dashboard', 'landing.secondary': 'View pricing', 'pages.podcasters.title': 'Podcaster plan info', 'pages.pricing.title': 'Subscription pricing', 'pages.docs.title': 'Documentation', 'pages.support.title': 'Support', 'pages.faq.title': 'FAQ',
    'pricing.kicker': 'Marketplace + SaaS in one SignalBoost cockpit', 'pricing.subtitle': 'Every plan links directly to SaaS modules deployed inside SignalBoost: Promote Business, Reviews, Calendar, Spreadsheets, Outreach, and Personal Assistant.', 'pricing.modules.title': 'Open SaaS modules inside SignalBoost', 'pricing.modules.subtitle': 'No separate SaaS repo is required; Vercel deploys these routes when SignalBoost main is merged.', 'pricing.tier.launch': 'Launch', 'pricing.tier.growth': 'Growth', 'pricing.tier.command': 'Command',
    'dashboard.title': 'Workspace modules', 'dashboard.subtitle': 'Choose a functional SignalBoost module.', 'projects.create': 'Create project', 'editor.preview': 'Preview', 'projects.title': 'Projects', 'projects.empty': 'No projects yet', 'billing.title': 'Billing', 'billing.current': 'Free plan', 'nav.automations': 'Automations', 'common.loading': 'Ready',
  },
  es: { 'nav.home':'Inicio','nav.podcasters':'Podcasters','nav.pricing':'Precios','nav.docs':'Docs','nav.dashboard':'Dashboard','nav.promote':'Promocionar negocio','nav.reviews':'Reseñas','nav.calendar':'Calendario','nav.spreadsheets':'Hojas de cálculo','nav.outreach':'Difusión','nav.assistant':'Asistente personal','landing.kicker':'Crecimiento multilingüe nativo','landing.title':'SignalBoost crea sitios, reseñas, audio y video para cada mercado.','landing.subtitle':'Lanza flujos localizados en inglés, español, portugués, polaco y ruso con respaldo en inglés.','landing.cta':'Abrir dashboard','landing.secondary':'Ver precios','pages.podcasters.title':'Información para podcasters','pages.pricing.title':'Precios de suscripción','pages.docs.title':'Documentación','pages.support.title':'Soporte','pages.faq.title':'FAQ','pricing.kicker':'Marketplace + SaaS en un cockpit SignalBoost','pricing.subtitle':'Cada plan enlaza módulos SaaS dentro de SignalBoost: Promocionar negocio, Reseñas, Calendario, Hojas de cálculo, Difusión y Asistente personal.','pricing.modules.title':'Abrir módulos SaaS en SignalBoost','pricing.modules.subtitle':'No se requiere un repo SaaS separado; Vercel despliega estas rutas al fusionar main.','pricing.tier.launch':'Lanzamiento','pricing.tier.growth':'Crecimiento','pricing.tier.command':'Comando' },
  pt: { 'nav.home':'Início','nav.podcasters':'Podcasters','nav.pricing':'Preços','nav.docs':'Docs','nav.dashboard':'Dashboard','nav.promote':'Promover negócio','nav.reviews':'Avaliações','nav.calendar':'Calendário','nav.spreadsheets':'Planilhas','nav.outreach':'Outreach','nav.assistant':'Assistente pessoal','landing.kicker':'Crescimento multilíngue nativo','landing.title':'SignalBoost cria sites, avaliações, áudio e vídeo para cada mercado.','landing.subtitle':'Lance fluxos localizados em inglês, espanhol, português, polonês e russo com fallback em inglês.','landing.cta':'Abrir dashboard','landing.secondary':'Ver preços','pages.podcasters.title':'Informações para podcasters','pages.pricing.title':'Preços de assinatura','pages.docs.title':'Documentação','pages.support.title':'Suporte','pages.faq.title':'FAQ','pricing.kicker':'Marketplace + SaaS em um cockpit SignalBoost','pricing.subtitle':'Cada plano aponta para módulos SaaS dentro do SignalBoost: Promover negócio, Avaliações, Calendário, Planilhas, Outreach e Assistente pessoal.','pricing.modules.title':'Abrir módulos SaaS no SignalBoost','pricing.modules.subtitle':'Nenhum repo SaaS separado é necessário; a Vercel implanta essas rotas quando main é mesclada.','pricing.tier.launch':'Lançamento','pricing.tier.growth':'Crescimento','pricing.tier.command':'Comando' },
  pl: { 'nav.home':'Start','nav.podcasters':'Podcasterzy','nav.pricing':'Cennik','nav.docs':'Dokumenty','nav.dashboard':'Dashboard','nav.promote':'Promuj firmę','nav.reviews':'Opinie','nav.calendar':'Kalendarz','nav.spreadsheets':'Arkusze','nav.outreach':'Outreach','nav.assistant':'Osobisty asystent','landing.kicker':'Natywny wzrost wielojęzyczny','landing.title':'SignalBoost tworzy strony, opinie, audio i wideo dla każdego rynku.','landing.subtitle':'Uruchamiaj lokalne workflow po angielsku, hiszpańsku, portugalsku, polsku i rosyjsku z fallbackiem do angielskiego.','landing.cta':'Otwórz dashboard','landing.secondary':'Zobacz cennik','pages.podcasters.title':'Informacje dla podcasterów','pages.pricing.title':'Cennik subskrypcji','pages.docs.title':'Dokumentacja','pages.support.title':'Pomoc','pages.faq.title':'FAQ','pricing.kicker':'Marketplace + SaaS w jednym kokpicie SignalBoost','pricing.subtitle':'Każdy plan linkuje do modułów SaaS w SignalBoost: Promuj firmę, Opinie, Kalendarz, Arkusze, Outreach i Osobisty asystent.','pricing.modules.title':'Otwórz moduły SaaS w SignalBoost','pricing.modules.subtitle':'Oddzielne repo SaaS nie jest potrzebne; Vercel wdraża te trasy po scaleniu main.','pricing.tier.launch':'Start','pricing.tier.growth':'Wzrost','pricing.tier.command':'Centrum dowodzenia' },
  ru: { 'nav.home':'Главная','nav.podcasters':'Подкастеры','nav.pricing':'Цены','nav.docs':'Документы','nav.dashboard':'Панель','nav.promote':'Продвигать бизнес','nav.reviews':'Отзывы','nav.calendar':'Календарь','nav.spreadsheets':'Таблицы','nav.outreach':'Рассылки','nav.assistant':'Личный ассистент','landing.kicker':'Нативный многоязычный рост','landing.title':'SignalBoost создает сайты, отзывы, аудио и видео для каждого рынка.','landing.subtitle':'Запускайте локализованные workflows на английском, испанском, португальском, польском и русском с fallback на английский.','landing.cta':'Открыть панель','landing.secondary':'Смотреть цены','pages.podcasters.title':'Информация для подкастеров','pages.pricing.title':'Цены подписки','pages.docs.title':'Документация','pages.support.title':'Поддержка','pages.faq.title':'FAQ','pricing.kicker':'Marketplace + SaaS в едином кокпите SignalBoost','pricing.subtitle':'Каждый план ведет к SaaS-модулям внутри SignalBoost: Продвигать бизнес, Отзывы, Календарь, Таблицы, Рассылки и Личный ассистент.','pricing.modules.title':'Открыть SaaS-модули в SignalBoost','pricing.modules.subtitle':'Отдельный SaaS-репозиторий не нужен; Vercel развернет эти маршруты после слияния main.','pricing.tier.launch':'Запуск','pricing.tier.growth':'Рост','pricing.tier.command':'Командный центр' },
}


Object.assign(dictionaries.en, {
  'saas.features.demo.playback': 'Demo playback preview',
  'saas.features.demo.preview': 'One localized recommendation preview',
  'saas.features.demo.readonly': 'Read-only rebuild checklist',
  'saas.features.paid.analyzer': 'Full production analyzer',
  'saas.features.paid.optimizer': 'Optimizer scoring and recommendations',
  'saas.features.paid.rebuild': 'Executable rebuild engine',
  'saas.features.paid.billing': 'Quota and overage billing enforcement',
  'saas.station.kicker': 'SaaS Station engine',
  'saas.input.label': 'Module request',
  'saas.tier.label': 'Subscription tier',
  'saas.run': 'Run analyzer',
  'saas.quota.title': 'Quota status',
  'saas.quota.subtitle': 'Usage is enforced before production rebuilds run.',
  'saas.quota.remaining': 'runs remaining',
  'saas.quota.overage': 'overage runs billable',
  'saas.billing.none': 'No overage charge. Usage is inside the active quota.',
  'saas.billing.title': 'Billing overage detected',
  'saas.billing.checkout': 'Open checkout',
  'saas.billing.ledger': 'Recorded to billing ledger',
  'saas.panel.analyzer.eyebrow': 'Analyzer',
  'saas.panel.analyzer.title': 'Signal audit',
  'saas.panel.optimizer.eyebrow': 'Optimizer',
  'saas.panel.optimizer.title': 'Recommended improvements',
  'saas.panel.rebuild.eyebrow': 'Rebuild',
  'saas.panel.rebuild.title': 'Execution blueprint',
  'saas.rebuild.ready': 'Production rebuild is enabled for this paid tier.',
  'saas.rebuild.demo': 'Demo playback only. Upgrade to execute the full rebuild engine.',
  'saas.features.title': 'Available features',
  'saas.concierge.title': 'Concierge routing + JSON-safe output',
  'saas.tier.free': 'Free demo',
  'saas.tier.launch': 'Launch',
  'saas.tier.growth': 'Growth',
  'saas.tier.command': 'Command',
  'saas.module.promote.label': 'Promote Business',
  'saas.module.promote.title': 'Promote Business Engine',
  'saas.module.promote.description': 'Analyze campaigns, optimize offers, and rebuild launch sequences with multilingual Marketplace context.',
  'saas.module.reviews.label': 'Reviews',
  'saas.module.reviews.title': 'Reviews Engine',
  'saas.module.reviews.description': 'Analyze sentiment, optimize responses, and rebuild proof workflows across supported languages.',
  'saas.module.calendar.label': 'Calendar',
  'saas.module.calendar.title': 'Calendar Engine',
  'saas.module.calendar.description': 'Analyze booking windows, optimize timing, and rebuild launch schedules.',
  'saas.module.spreadsheets.label': 'Spreadsheets',
  'saas.module.spreadsheets.title': 'Spreadsheets Engine',
  'saas.module.spreadsheets.description': 'Analyze rows, optimize schemas, and rebuild clean data flows for Outreach handoff.',
  'saas.module.outreach.label': 'Outreach',
  'saas.module.outreach.title': 'Outreach Engine',
  'saas.module.outreach.description': 'Analyze queues, optimize sequences, and rebuild send ladders with billing-safe quota enforcement.',
  'saas.module.assistant.label': 'Personal Assistant',
  'saas.module.assistant.title': 'Concierge Assistant Engine',
  'saas.module.assistant.description': 'Analyze intents, optimize next actions, and rebuild validated multilingual Concierge output.',
})

Object.assign(dictionaries.es, {
  'saas.features.demo.playback': 'Vista previa de reproducción demo',
  'saas.features.demo.preview': 'Una recomendación localizada',
  'saas.features.demo.readonly': 'Checklist de reconstrucción de solo lectura',
  'saas.features.paid.analyzer': 'Analizador completo de producción',
  'saas.features.paid.optimizer': 'Puntuación y recomendaciones del optimizador',
  'saas.features.paid.rebuild': 'Motor de reconstrucción ejecutable',
  'saas.features.paid.billing': 'Control de cuota y cobros extra',
  'saas.station.kicker': 'Motor de SaaS Station', 'saas.input.label': 'Solicitud del módulo', 'saas.tier.label': 'Nivel de suscripción', 'saas.run': 'Ejecutar analizador', 'saas.quota.title': 'Estado de cuota', 'saas.quota.subtitle': 'El uso se valida antes de ejecutar reconstrucciones de producción.', 'saas.quota.remaining': 'ejecuciones restantes', 'saas.quota.overage': 'ejecuciones extra facturables', 'saas.billing.none': 'Sin cargo extra. El uso está dentro de la cuota activa.', 'saas.billing.title': 'Exceso de facturación detectado', 'saas.billing.checkout': 'Abrir pago', 'saas.billing.ledger': 'Registrado en facturación', 'saas.panel.analyzer.eyebrow': 'Analizador', 'saas.panel.analyzer.title': 'Auditoría de señales', 'saas.panel.optimizer.eyebrow': 'Optimizador', 'saas.panel.optimizer.title': 'Mejoras recomendadas', 'saas.panel.rebuild.eyebrow': 'Reconstrucción', 'saas.panel.rebuild.title': 'Plan de ejecución', 'saas.rebuild.ready': 'La reconstrucción de producción está habilitada para este plan pago.', 'saas.rebuild.demo': 'Solo reproducción demo. Actualiza para ejecutar el motor completo.', 'saas.features.title': 'Funciones disponibles', 'saas.concierge.title': 'Ruta Concierge + salida JSON segura', 'saas.tier.free': 'Demo gratis', 'saas.tier.launch': 'Lanzamiento', 'saas.tier.growth': 'Crecimiento', 'saas.tier.command': 'Comando',
  'saas.module.promote.title': 'Motor de Promoción', 'saas.module.promote.description': 'Analiza campañas, optimiza ofertas y reconstruye lanzamientos con contexto multilingüe.', 'saas.module.reviews.title': 'Motor de Reseñas', 'saas.module.reviews.description': 'Analiza sentimiento, optimiza respuestas y reconstruye prueba social.', 'saas.module.calendar.title': 'Motor de Calendario', 'saas.module.calendar.description': 'Analiza ventanas de reserva, optimiza tiempos y reconstruye agendas.', 'saas.module.spreadsheets.title': 'Motor de Hojas de cálculo', 'saas.module.spreadsheets.description': 'Analiza filas, optimiza esquemas y reconstruye flujos de datos limpios.', 'saas.module.outreach.title': 'Motor de Difusión', 'saas.module.outreach.description': 'Analiza colas, optimiza secuencias y reconstruye seguimientos.', 'saas.module.assistant.title': 'Motor de Asistente Concierge', 'saas.module.assistant.description': 'Analiza intenciones, optimiza acciones y reconstruye salida multilingüe validada.'
})

Object.assign(dictionaries.pt, {
  'saas.features.demo.playback': 'Prévia de reprodução demo',
  'saas.features.demo.preview': 'Uma recomendação localizada',
  'saas.features.demo.readonly': 'Checklist de reconstrução somente leitura',
  'saas.features.paid.analyzer': 'Analisador completo de produção',
  'saas.features.paid.optimizer': 'Pontuação e recomendações do otimizador',
  'saas.features.paid.rebuild': 'Motor de reconstrução executável',
  'saas.features.paid.billing': 'Controle de cota e cobrança extra',
  'saas.station.kicker': 'Motor SaaS Station', 'saas.input.label': 'Solicitação do módulo', 'saas.tier.label': 'Plano de assinatura', 'saas.run': 'Executar analisador', 'saas.quota.title': 'Status da cota', 'saas.quota.subtitle': 'O uso é validado antes das reconstruções de produção.', 'saas.quota.remaining': 'execuções restantes', 'saas.quota.overage': 'execuções extras faturáveis', 'saas.billing.none': 'Sem cobrança extra. O uso está dentro da cota ativa.', 'saas.billing.title': 'Excesso de cobrança detectado', 'saas.billing.checkout': 'Abrir checkout', 'saas.billing.ledger': 'Registrado no faturamento', 'saas.panel.analyzer.eyebrow': 'Analisador', 'saas.panel.analyzer.title': 'Auditoria de sinais', 'saas.panel.optimizer.eyebrow': 'Otimizador', 'saas.panel.optimizer.title': 'Melhorias recomendadas', 'saas.panel.rebuild.eyebrow': 'Reconstrução', 'saas.panel.rebuild.title': 'Plano de execução', 'saas.rebuild.ready': 'A reconstrução de produção está habilitada para este plano pago.', 'saas.rebuild.demo': 'Apenas reprodução demo. Faça upgrade para executar o motor completo.', 'saas.features.title': 'Recursos disponíveis', 'saas.concierge.title': 'Roteamento Concierge + saída JSON segura', 'saas.tier.free': 'Demo grátis', 'saas.tier.launch': 'Lançamento', 'saas.tier.growth': 'Crescimento', 'saas.tier.command': 'Comando',
  'saas.module.promote.title': 'Motor de Promoção', 'saas.module.promote.description': 'Analisa campanhas, otimiza ofertas e reconstrói lançamentos multilíngues.', 'saas.module.reviews.title': 'Motor de Avaliações', 'saas.module.reviews.description': 'Analisa sentimento, otimiza respostas e reconstrói prova social.', 'saas.module.calendar.title': 'Motor de Calendário', 'saas.module.calendar.description': 'Analisa reservas, otimiza horários e reconstrói agendas.', 'saas.module.spreadsheets.title': 'Motor de Planilhas', 'saas.module.spreadsheets.description': 'Analisa linhas, otimiza esquemas e reconstrói dados limpos.', 'saas.module.outreach.title': 'Motor de Outreach', 'saas.module.outreach.description': 'Analisa filas, otimiza sequências e reconstrói follow-ups.', 'saas.module.assistant.title': 'Motor de Assistente Concierge', 'saas.module.assistant.description': 'Analisa intenções, otimiza ações e reconstrói saída validada.'
})

Object.assign(dictionaries.pl, {
  'saas.features.demo.playback': 'Podgląd odtwarzania demo',
  'saas.features.demo.preview': 'Jedna lokalna rekomendacja',
  'saas.features.demo.readonly': 'Lista przebudowy tylko do odczytu',
  'saas.features.paid.analyzer': 'Pełny analizator produkcyjny',
  'saas.features.paid.optimizer': 'Oceny i rekomendacje optymalizatora',
  'saas.features.paid.rebuild': 'Wykonywalny silnik przebudowy',
  'saas.features.paid.billing': 'Egzekwowanie limitów i nadwyżek',
  'saas.station.kicker': 'Silnik SaaS Station', 'saas.input.label': 'Zapytanie modułu', 'saas.tier.label': 'Poziom subskrypcji', 'saas.run': 'Uruchom analizator', 'saas.quota.title': 'Status limitu', 'saas.quota.subtitle': 'Użycie jest sprawdzane przed produkcyjną przebudową.', 'saas.quota.remaining': 'uruchomień pozostało', 'saas.quota.overage': 'płatnych nadwyżek', 'saas.billing.none': 'Brak dopłaty. Użycie mieści się w limicie.', 'saas.billing.title': 'Wykryto nadwyżkę rozliczeniową', 'saas.billing.checkout': 'Otwórz płatność', 'saas.billing.ledger': 'Zapisano w rozliczeniach', 'saas.panel.analyzer.eyebrow': 'Analizator', 'saas.panel.analyzer.title': 'Audyt sygnałów', 'saas.panel.optimizer.eyebrow': 'Optymalizator', 'saas.panel.optimizer.title': 'Rekomendowane ulepszenia', 'saas.panel.rebuild.eyebrow': 'Przebudowa', 'saas.panel.rebuild.title': 'Plan wykonania', 'saas.rebuild.ready': 'Produkcyjna przebudowa jest dostępna w tym płatnym planie.', 'saas.rebuild.demo': 'Tylko demo. Uaktualnij, aby uruchomić pełny silnik.', 'saas.features.title': 'Dostępne funkcje', 'saas.concierge.title': 'Routing Concierge + bezpieczny JSON', 'saas.tier.free': 'Darmowe demo', 'saas.tier.launch': 'Start', 'saas.tier.growth': 'Wzrost', 'saas.tier.command': 'Centrum dowodzenia',
  'saas.module.promote.title': 'Silnik Promocji', 'saas.module.promote.description': 'Analizuje kampanie, optymalizuje oferty i przebudowuje starty.', 'saas.module.reviews.title': 'Silnik Opinii', 'saas.module.reviews.description': 'Analizuje sentyment, optymalizuje odpowiedzi i przebudowuje dowody.', 'saas.module.calendar.title': 'Silnik Kalendarza', 'saas.module.calendar.description': 'Analizuje rezerwacje, optymalizuje czas i przebudowuje harmonogram.', 'saas.module.spreadsheets.title': 'Silnik Arkuszy', 'saas.module.spreadsheets.description': 'Analizuje wiersze, optymalizuje schematy i przebudowuje dane.', 'saas.module.outreach.title': 'Silnik Outreach', 'saas.module.outreach.description': 'Analizuje kolejki, optymalizuje sekwencje i przebudowuje wysyłkę.', 'saas.module.assistant.title': 'Silnik Asystenta Concierge', 'saas.module.assistant.description': 'Analizuje intencje, optymalizuje akcje i przebudowuje zweryfikowane odpowiedzi.'
})

Object.assign(dictionaries.ru, {
  'saas.features.demo.playback': 'Предпросмотр демо-воспроизведения',
  'saas.features.demo.preview': 'Одна локализованная рекомендация',
  'saas.features.demo.readonly': 'Чеклист перестройки только для чтения',
  'saas.features.paid.analyzer': 'Полный производственный анализатор',
  'saas.features.paid.optimizer': 'Оценки и рекомендации оптимизатора',
  'saas.features.paid.rebuild': 'Исполняемый движок перестройки',
  'saas.features.paid.billing': 'Контроль квот и оплат превышений',
  'saas.station.kicker': 'Движок SaaS Station', 'saas.input.label': 'Запрос модуля', 'saas.tier.label': 'Уровень подписки', 'saas.run': 'Запустить анализатор', 'saas.quota.title': 'Статус квоты', 'saas.quota.subtitle': 'Использование проверяется до производственной перестройки.', 'saas.quota.remaining': 'запусков осталось', 'saas.quota.overage': 'платных превышений', 'saas.billing.none': 'Доплаты нет. Использование в пределах активной квоты.', 'saas.billing.title': 'Обнаружено превышение оплаты', 'saas.billing.checkout': 'Открыть оплату', 'saas.billing.ledger': 'Записано в биллинг', 'saas.panel.analyzer.eyebrow': 'Анализатор', 'saas.panel.analyzer.title': 'Аудит сигналов', 'saas.panel.optimizer.eyebrow': 'Оптимизатор', 'saas.panel.optimizer.title': 'Рекомендованные улучшения', 'saas.panel.rebuild.eyebrow': 'Перестройка', 'saas.panel.rebuild.title': 'План выполнения', 'saas.rebuild.ready': 'Производственная перестройка включена для этого платного плана.', 'saas.rebuild.demo': 'Только демо. Обновите план для полного движка.', 'saas.features.title': 'Доступные функции', 'saas.concierge.title': 'Маршрутизация Concierge + JSON-safe вывод', 'saas.tier.free': 'Бесплатное демо', 'saas.tier.launch': 'Запуск', 'saas.tier.growth': 'Рост', 'saas.tier.command': 'Командный',
  'saas.module.promote.title': 'Движок продвижения', 'saas.module.promote.description': 'Анализирует кампании, оптимизирует офферы и перестраивает запуски.', 'saas.module.reviews.title': 'Движок отзывов', 'saas.module.reviews.description': 'Анализирует тональность, оптимизирует ответы и перестраивает доказательства.', 'saas.module.calendar.title': 'Движок календаря', 'saas.module.calendar.description': 'Анализирует окна бронирования, оптимизирует сроки и перестраивает расписания.', 'saas.module.spreadsheets.title': 'Движок таблиц', 'saas.module.spreadsheets.description': 'Анализирует строки, оптимизирует схемы и перестраивает чистые данные.', 'saas.module.outreach.title': 'Движок рассылок', 'saas.module.outreach.description': 'Анализирует очереди, оптимизирует последовательности и перестраивает отправки.', 'saas.module.assistant.title': 'Движок Concierge-ассистента', 'saas.module.assistant.description': 'Анализирует намерения, оптимизирует действия и перестраивает проверенный ответ.'
})

interface I18nContextProps { dict: Dict; lang: Lang; setLang: (lang: string) => void }
const I18nContext = createContext<I18nContextProps>({ dict: dictionaries.en, lang: 'en', setLang: () => {} })
const supported = ['en', 'es', 'pt', 'pl', 'ru'] as const
function normalize(lang: string): Lang { const short = lang.toLowerCase().slice(0,2); return supported.includes(short as Lang) ? short as Lang : 'en' }

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')
  useEffect(() => setLangState(normalize(detectLanguage())), [])
  const setLang = (next: string) => { const safe = normalize(next); localStorage.setItem('site-language', safe); setLangState(safe) }
  const dict = useMemo(() => ({ ...dictionaries.en, ...dictionaries[lang] }), [lang])
  return <I18nContext.Provider value={{ dict, lang, setLang }}>{children}</I18nContext.Provider>
}

export function useI18n() { return useContext(I18nContext) }
