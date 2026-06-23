'use client'

import React, { useState } from 'react'
import CanvasEditor from './CanvasEditor'
import { supabase } from '@/lib/supabaseClient'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function VideoEditor() {
  const { t } = useTransl
