'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

const MAP: Record<string,string> = {
  en:'English',
  es:'Español',
  pt:'Português',
  pl:'Polski',
  ru:'Русский'
}

export default function LanguageSuggestion(){

  const {lang,setLang} = useI18n()

  const [show,setShow]=useState(false)
  const [suggested,setSuggested]=
  useState('en')

  useEffect(()=>{

    if(typeof window==='undefined')
      return

    const alreadyHandled=
      localStorage.getItem(
        'signalboost_language_prompted'
      )

    if(alreadyHandled) return

    const browser=
      (
        navigator.languages?.[0] ||
        navigator.language ||
        'en'
      )
      .toLowerCase()

    let detected='en'

    if(browser.startsWith('es'))
      detected='es'

    if(browser.startsWith('pt'))
      detected='pt'

    if(browser.startsWith('pl'))
      detected='pl'

    if(browser.startsWith('ru'))
      detected='ru'

    if(
      detected!==lang
    ){
      setSuggested(detected)
      setShow(true)
    }

  },[lang])

  function keepCurrent(){

    localStorage.setItem(
      'signalboost_language_prompted',
      '1'
    )

    setShow(false)
  }

  async function switchLanguage(){

    await setLang(
      suggested
    )

    localStorage.setItem(
      'signalboost_language_prompted',
      '1'
    )

    setShow(false)
  }

  if(!show) return null

  return(

  <div
  style={{
    position:'fixed',
    bottom:20,
    right:20,
    width:320,
    zIndex:999,
    background:'var(--surface-1)',
    border:
    '1px solid var(--border-medium)',
    borderRadius:18,
    padding:18,
    boxShadow:
    '0 15px 50px rgba(0,0,0,.35)'
  }}
  >

    <div
    style={{
      fontWeight:800,
      marginBottom:8
    }}
    >
      🌎 Language suggestion
    </div>

    <div
    style={{
      color:'var(--text-muted)',
      fontSize:13,
      lineHeight:1.6,
      marginBottom:18
    }}
    >
      We noticed you may prefer{' '}
      <strong>
      {MAP[suggested]}
      </strong>
    </div>

    <div
    style={{
      display:'flex',
      gap:8
    }}
    >

      <button
      onClick={
        switchLanguage
      }
      style={{
        flex:1,
        background:'#ffc300',
        color:'#000',
        border:'none',
        borderRadius:999,
        padding:'10px',
        fontWeight:800,
        cursor:'pointer'
      }}
      >
      Switch
      </button>

      <button
      onClick={
        keepCurrent
      }
      style={{
        flex:1,
        background:
        'var(--surface-2)',
        color:
        'var(--text-secondary)',
        border:
        '1px solid var(--border-medium)',
        borderRadius:999,
        padding:'10px',
        cursor:'pointer'
      }}
      >
      Keep current
      </button>

    </div>

  </div>

  )
}
