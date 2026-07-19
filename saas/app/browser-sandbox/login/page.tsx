'use client'

import { FormEvent, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type View = 'login' | 'dashboard' | 'settings'

const COPY: Record<Lang, {
  sandboxLabel: string
  testLogin: string
  email: string
  password: string
  signIn: string
  sandboxDashboard: string
  noProduction: string
  openSettings: string
  sandboxSettings: string
  testEnvValue: string
  protectedSave: string
  savedSuccessfully: string
}> = {
  en: {
    sandboxLabel: 'SignalBoost Browser Sandbox',
    testLogin: 'Test provider login',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    sandboxDashboard: 'Sandbox dashboard',
    noProduction: 'This portal contains no production systems or credentials.',
    openSettings: 'Open settings',
    sandboxSettings: 'Sandbox settings',
    testEnvValue: 'Test environment value',
    protectedSave: 'Protected save',
    savedSuccessfully: 'Saved successfully:',
  },
  es: {
    sandboxLabel: 'Sandbox de navegador SignalBoost',
    testLogin: 'Prueba de inicio de sesión del proveedor',
    email: 'Correo electrónico',
    password: 'Contraseña',
    signIn: 'Iniciar sesión',
    sandboxDashboard: 'Panel de sandbox',
    noProduction: 'Este portal no contiene sistemas de producción ni credenciales.',
    openSettings: 'Abrir configuración',
    sandboxSettings: 'Configuración de sandbox',
    testEnvValue: 'Valor del entorno de prueba',
    protectedSave: 'Guardar protegido',
    savedSuccessfully: 'Guardado correctamente:',
  },
  pt: {
    sandboxLabel: 'Sandbox de navegador SignalBoost',
    testLogin: 'Teste de login do provedor',
    email: 'E-mail',
    password: 'Senha',
    signIn: 'Entrar',
    sandboxDashboard: 'Painel de sandbox',
    noProduction: 'Este portal não contém sistemas de produção ou credenciais.',
    openSettings: 'Abrir configurações',
    sandboxSettings: 'Configurações de sandbox',
    testEnvValue: 'Valor do ambiente de teste',
    protectedSave: 'Salvar protegido',
    savedSuccessfully: 'Salvo com sucesso:',
  },
  pl: {
    sandboxLabel: 'Piaskownica przeglądarki SignalBoost',
    testLogin: 'Testowe logowanie dostawcy',
    email: 'E-mail',
    password: 'Hasło',
    signIn: 'Zaloguj się',
    sandboxDashboard: 'Panel piaskownicy',
    noProduction: 'Ten portal nie zawiera systemów produkcyjnych ani danych uwierzytelniających.',
    openSettings: 'Otwórz ustawienia',
    sandboxSettings: 'Ustawienia piaskownicy',
    testEnvValue: 'Wartość środowiska testowego',
    protectedSave: 'Chroniony zapis',
    savedSuccessfully: 'Zapisano pomyślnie:',
  },
  ru: {
    sandboxLabel: 'Браузерная песочница SignalBoost',
    testLogin: 'Тестовый вход провайдера',
    email: 'Электронная почта',
    password: 'Пароль',
    signIn: 'Войти',
    sandboxDashboard: 'Панель песочницы',
    noProduction: 'Этот портал не содержит производственных систем или учётных данных.',
    openSettings: 'Открыть настройки',
    sandboxSettings: 'Настройки песочницы',
    testEnvValue: 'Значение тестовой среды',
    protectedSave: 'Защищённое сохранение',
    savedSuccessfully: 'Успешно сохранено:',
  },
}

export default function BrowserSandboxLoginPage() {
  const { lang } = useI18n()
  const c = COPY[(lang as Lang) || 'en'] || COPY.en

  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sandboxValue, setSandboxValue] = useState('unchanged')
  const [savedValue, setSavedValue] = useState<string | null>(null)

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email || !password) return
    setView('dashboard')
  }

  function saveSandboxValue() {
    setSavedValue(sandboxValue)
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
          {c.sandboxLabel}
        </p>

        {view === 'login' && (
          <section data-browser-sandbox="login">
            <h1 className="mb-6 text-3xl font-semibold">{c.testLogin}</h1>
            <form className="space-y-4" onSubmit={submitLogin}>
              <label className="block">
                <span className="mb-1 block text-sm">{c.email}</span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                  name="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm">{c.password}</span>
                <input
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                  name="password"
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </label>
              <button
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
                data-action="login"
                type="submit"
              >
                {c.signIn}
              </button>
            </form>
          </section>
        )}

        {view === 'dashboard' && (
          <section data-browser-sandbox="dashboard">
            <h1 className="mb-4 text-3xl font-semibold">{c.sandboxDashboard}</h1>
            <p className="mb-6 text-slate-300">{c.noProduction}</p>
            <button
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950"
              data-action="open-settings"
              type="button"
              onClick={() => setView('settings')}
            >
              {c.openSettings}
            </button>
          </section>
        )}

        {view === 'settings' && (
          <section data-browser-sandbox="settings">
            <h1 className="mb-4 text-3xl font-semibold">{c.sandboxSettings}</h1>
            <label className="block">
              <span className="mb-1 block text-sm">{c.testEnvValue}</span>
              <input
                className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2"
                name="sandboxValue"
                value={sandboxValue}
                onChange={event => {
                  setSandboxValue(event.target.value)
                  setSavedValue(null)
                }}
              />
            </label>
            <button
              className="mt-4 rounded-lg border border-amber-400 px-4 py-2 text-amber-300"
              data-action="protected-save"
              type="button"
              onClick={saveSandboxValue}
            >
              {c.protectedSave}
            </button>
            {savedValue !== null && (
              <p
                className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-300"
                data-browser-sandbox="save-success"
                role="status"
              >
                {c.savedSuccessfully} <span data-saved-value>{savedValue}</span>
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
