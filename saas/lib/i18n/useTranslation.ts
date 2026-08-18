'use client'

// This module previously shipped a stub that always returned the English
// fallback. It now re-exports the real context-backed hook so every existing
// import path (`@/lib/i18n/useTranslation`) resolves to working i18n.
export { useTranslation } from '@/components/i18n/useTranslation'
