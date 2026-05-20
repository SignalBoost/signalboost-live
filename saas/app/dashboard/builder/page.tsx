'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

const TEMPLATES = [
  { id: 'restaurant', icon: '🍽️', name: 'Restaurant', desc: 'Menu, hours, reservations, location' },
  { id: 'retail', icon: '🛍️', name: 'Retail Shop', desc: 'Products, pricing, contact, about' },
  { id: 'services', icon: '💼', name: 'Services', desc: 'What you offer, pricing, booking' },
  { id: 'podcast', icon: '🎙️', name: 'Podcast', desc: 'Episodes, about, subscribe links' },
  { id: 'portfolio', icon: '🎨', name: 'Portfolio', desc: 'Work showcase, bio, contact' },
  { id: 'blank', icon: '✨', name: 'Start blank', desc: 'Build from scratch with AI help' },
]

const LANGS = [
  { code: 'en', flag: '🇺🇸', name: 'English' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
]

// Safe translation helper — always returns a string.
// Accepts dot paths like 'hero.features.site' and a guaranteed-string fallback.
function makeT(dict: any) {
  return function t(path: string, fallback: string): string {
    const value = path
      .split('.')
      .reduce((acc: any, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
    return typeof value === 'string' ? value : fallback
  }
}

export default function BuilderPa
