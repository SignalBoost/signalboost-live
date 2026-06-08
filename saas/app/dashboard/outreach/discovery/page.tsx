'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const PLATFORMS = ['manual', 'google', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'telegram', 'wechat', 'reddit', 'website', 'directory']

const CATEGORIES = ['company', 'affiliate', 'media']

type DiscoveryCopy = {
  eyebrow: string
  title: string
  subtitle: string
  urlLabel: string
  nameLabel: string
  sourceLabel: string
  categoryLabel: string
  notesLabel: string
  urlPlaceholder: string
  namePlaceholder: string
  notesPlaceholder: string
  missingUrl: string
  analyzeError: string
  genericError: string
  analyzing: string
  analyzeButton: string
  viewContacts: string
  leadQueued: string
  newLead: string
  draftFirstTouch: string
  reviewContacts: string
  openEngine: string
  generateDeck: string
  generatingDeck: string
  deckError: string
  platforms: Record<string, string>
  categories: Record<string, string>
}

const COPY: Record<string, DiscoveryCopy> = {
  en: {
    eyebrow: 'Discovery',
    title: 'Find a business and let AI prepare the outreach.',
    subtitle: 'Paste a public website, Google profile, or social page. SignalBoost analyzes the business, predicts its needs, and drops a ready-to-review lead into your contacts queue.',
    urlLabel: 'Business URL or profile *',
    nameLabel: 'Business name (optional)',
    sourceLabel: 'Source',
    categoryLabel: 'Outreach type',
    notesLabel: 'Public text / notes (optional)',
    urlPlaceholder: 'https://example.com',
    namePlaceholder: 'e.g. Luna Travel',
    notesPlaceholder: 'Paste a bio, reviews, or anything that describes what they do.',
    missingUrl: 'Add a business URL or profile link to analyze.',
    analyzeError: 'Could not analyze this lead.',
    genericError: 'Something went wrong. Please try again.',
    analyzing: 'Analyzing…',
    analyzeButton: 'Analyze & queue lead',
    viewContacts: 'View contacts queue',
    leadQueued: 'Lead queued',
    newLead: 'New lead',
    draftFirstTouch: 'Draft first touch',
    reviewContacts: 'Review in contacts',
    openEngine: 'Open engine',
    generateDeck: 'Generate pitch deck',
    generatingDeck: 'Building deck…',
    deckError: 'Could not generate the deck.',
    platforms: {
      manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Website', directory: 'Directory',
    },
    categories: { company: 'Company', affiliate: 'Affiliate / Partner', media: 'Media Platform' },
  },
  pt: {
    eyebrow: 'Descoberta',
    title: 'Encontre um negócio e deixe a IA preparar a prospecção.',
    subtitle: 'Cole um site público, perfil do Google ou página social. O SignalBoost analisa o negócio, prevê suas necessidades e coloca um lead pronto para revisão na fila de contatos.',
    urlLabel: 'URL ou perfil do negócio *',
    nameLabel: 'Nome do negócio (opcional)',
    sourceLabel: 'Fonte',
    categoryLabel: 'Tipo de prospecção',
    notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://exemplo.com',
    namePlaceholder: 'ex.: Luna Travel',
    notesPlaceholder: 'Cole uma bio, avaliações ou qualquer coisa que descreva o que eles fazem.',
    missingUrl: 'Adicione uma URL ou link de perfil do negócio para analisar.',
    analyzeError: 'Não foi possível analisar este lead.',
    genericError: 'Algo deu errado. Tente novamente.',
    analyzing: 'Analisando…',
    analyzeButton: 'Analisar e colocar lead na fila',
    viewContacts: 'Ver fila de contatos',
    leadQueued: 'Lead na fila',
    newLead: 'Novo lead',
    draftFirstTouch: 'Primeiro contato em rascunho',
    reviewContacts: 'Revisar em contatos',
    openEngine: 'Abrir motor',
    generateDeck: 'Gerar apresentação',
    generatingDeck: 'Criando apresentação…',
    deckError: 'Não foi possível gerar a apresentação.',
    platforms: {
      manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Site', directory: 'Diretório',
    },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Parceiro', media: 'Plataforma de Mídia' },
  },
  es: {
    eyebrow: 'Descubrimiento',
    title: 'Encuentra un negocio y deja que la IA prepare la prospección.',
    subtitle: 'Pega un sitio público, perfil de Google o página social. SignalBoost analiza el negocio, predice sus necesidades y coloca un lead listo para revisar en la cola de contactos.',
    urlLabel: 'URL o perfil del negocio *',
    nameLabel: 'Nombre del negocio (opcional)',
    sourceLabel: 'Fuente',
    categoryLabel: 'Tipo de prospección',
    notesLabel: 'Texto público / notas (opcional)',
    urlPlaceholder: 'https://ejemplo.com',
    namePlaceholder: 'ej.: Luna Travel',
    notesPlaceholder: 'Pega una bio, reseñas o cualquier cosa que describa lo que hacen.',
    missingUrl: 'Agrega una URL o enlace de perfil del negocio para analizar.',
    analyzeError: 'No se pudo analizar este lead.',
    genericError: 'Algo salió mal. Inténtalo de nuevo.',
    analyzing: 'Analizando…',
    analyzeButton: 'Analizar y poner lead en cola',
    viewContacts: 'Ver cola de contactos',
    leadQueued: 'Lead en cola',
    newLead: 'Nuevo lead',
    draftFirstTouch: 'Primer contacto en borrador',
    reviewContacts: 'Revisar en contactos',
    openEngine: 'Abrir motor',
    generateDeck: 'Generar presentación',
    generatingDeck: 'Creando presentación…',
    deckError: 'No se pudo generar la presentación.',
    platforms: {
      manual: 'Manual', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Sitio web', directory: 'Directorio',
    },
    categories: { company: 'Empresa', affiliate: 'Afiliado / Socio', media: 'Plataforma de Medios' },
  },
  pl: {
    eyebrow: 'Odkrywanie',
    title: 'Znajdź firmę i pozwól AI przygotować outreach.',
    subtitle: 'Wklej publiczną stronę, profil Google albo stronę społecznościową. SignalBoost analizuje firmę, przewiduje jej potrzeby i dodaje lead do kolejki kontaktów.',
    urlLabel: 'URL firmy lub profil *',
    nameLabel: 'Nazwa firmy (opcjonalnie)',
    sourceLabel: 'Źródło',
    categoryLabel: 'Typ outreachu',
    notesLabel: 'Tekst publiczny / notatki (opcjonalnie)',
    urlPlaceholder: 'https://przyklad.com',
    namePlaceholder: 'np. Luna Travel',
    notesPlaceholder: 'Wklej bio, opinie albo opis tego, czym się zajmują.',
    missingUrl: 'Dodaj URL firmy lub link do profilu, aby przeanalizować.',
    analyzeError: 'Nie można przeanalizować tego leada.',
    genericError: 'Coś poszło nie tak. Spróbuj ponownie.',
    analyzing: 'Analizowanie…',
    analyzeButton: 'Analizuj i dodaj lead',
    viewContacts: 'Zobacz kolejkę kontaktów',
    leadQueued: 'Lead dodany',
    newLead: 'Nowy lead',
    draftFirstTouch: 'Szkic pierwszego kontaktu',
    reviewContacts: 'Sprawdź w kontaktach',
    openEngine: 'Otwórz silnik',
    generateDeck: 'Wygeneruj prezentację',
    generatingDeck: 'Tworzenie prezentacji…',
    deckError: 'Nie można wygenerować prezentacji.',
    platforms: {
      manual: 'Manualnie', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Strona', directory: 'Katalog',
    },
    categories: { company: 'Firma', affiliate: 'Partner / Afiliacja', media: 'Platforma medialna' },
  },
  ru: {
    eyebrow: 'Поиск',
    title: 'Найдите компанию и позвольте AI подготовить аутрич.',
    subtitle: 'Вставьте публичный сайт, профиль Google или социальную страницу. SignalBoost анализирует бизнес, прогнозирует его потребности и добавляет lead в очередь контактов.',
    urlLabel: 'URL компании или профиль *',
    nameLabel: 'Название компании (необязательно)',
    sourceLabel: 'Источник',
    categoryLabel: 'Тип аутрича',
    notesLabel: 'Публичный текст / заметки (необязательно)',
    urlPlaceholder: 'https://example.com',
    namePlaceholder: 'например: Luna Travel',
    notesPlaceholder: 'Вставьте био, отзывы или описание того, чем они занимаются.',
    missingUrl: 'Добавьте URL компании или ссылку на профиль для анализа.',
    analyzeError: 'Не удалось проанализировать этот lead.',
    genericError: 'Что-то пошло не так. Попробуйте снова.',
    analyzing: 'Анализ…',
    analyzeButton: 'Анализировать и добавить lead',
    viewContacts: 'Посмотреть очередь контактов',
    leadQueued: 'Lead добавлен',
    newLead: 'Новый lead',
    draftFirstTouch: 'Черновик первого контакта',
    reviewContacts: 'Проверить в контактах',
    openEngine: 'Открыть движок',
    generateDeck: 'Создать презентацию',
    generatingDeck: 'Создание презентации…',
    deckError: 'Не удалось создать презентацию.',
    platforms: {
      manual: 'Вручную', google: 'Google', facebook: 'Facebook', instagram: 'Instagram',
      linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', telegram: 'Telegram',
      wechat: 'WeChat', reddit: 'Reddit', website: 'Сайт', directory: 'Каталог',
    },
    categories: { company: 'Компания', affiliate: 'Партнёр / Аффилиат', media: 'Медиаплатформа' },
  },
}

function copyFor(lang: string): DiscoveryCopy {
  return COPY[lang] || COPY.en
}
