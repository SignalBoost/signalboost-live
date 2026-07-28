type HomepageLocaleValue = string | string[] | HomepageLocaleDict
type HomepageLocaleDict = { [key: string]: HomepageLocaleValue }

export const HOMEPAGE_UI_LOCALES: Record<string, HomepageLocaleDict> = {
  en: {
    languages: {
      en: 'English',
      es: 'Spanish',
      pt: 'Portuguese',
      pl: 'Polish',
      ru: 'Russian',
    },
    stats: {
      aria: 'Live platform activity',
      activePortables: 'Active portables',
      verifiedRows: 'Verified rows',
      systemStatus: 'System status',
    },
    system: {
      active: 'Active',
      idle: 'Idle',
      degraded: 'Degraded',
      unreachable: 'Data unavailable',
      loading: 'Loading',
    },
    runtime: {
      active: 'Active',
      idle: 'Connected · idle',
      unreachable: 'Data unavailable',
      no_live_source: 'Not connected',
    },
    activity: {
      none: 'No activity recorded',
      unavailable: 'Activity time unavailable',
    },
    toolStatus: {
      free: 'Free',
      live: 'Live',
    },
    licenseEmailSubject: 'Licensing SignalBoost modules',
  },
  es: {
    languages: {
      en: 'Inglés',
      es: 'Español',
      pt: 'Portugués',
      pl: 'Polaco',
      ru: 'Ruso',
    },
    stats: {
      aria: 'Actividad en vivo de la plataforma',
      activePortables: 'Portátiles activos',
      verifiedRows: 'Filas verificadas',
      systemStatus: 'Estado del sistema',
    },
    system: {
      active: 'Activo',
      idle: 'En espera',
      degraded: 'Degradado',
      unreachable: 'Datos no disponibles',
      loading: 'Cargando',
    },
    runtime: {
      active: 'Activo',
      idle: 'Conectado · en espera',
      unreachable: 'Datos no disponibles',
      no_live_source: 'Sin conexión',
    },
    activity: {
      none: 'Sin actividad registrada',
      unavailable: 'Hora de actividad no disponible',
    },
    toolStatus: {
      free: 'Gratis',
      live: 'Activo',
    },
    licenseEmailSubject: 'Licencia de módulos de SignalBoost',
  },
  pt: {
    languages: {
      en: 'Inglês',
      es: 'Espanhol',
      pt: 'Português',
      pl: 'Polonês',
      ru: 'Russo',
    },
    stats: {
      aria: 'Atividade da plataforma em tempo real',
      activePortables: 'Portáteis ativos',
      verifiedRows: 'Linhas verificadas',
      systemStatus: 'Estado do sistema',
    },
    system: {
      active: 'Ativo',
      idle: 'Em espera',
      degraded: 'Degradado',
      unreachable: 'Dados indisponíveis',
      loading: 'Carregando',
    },
    runtime: {
      active: 'Ativo',
      idle: 'Conectado · em espera',
      unreachable: 'Dados indisponíveis',
      no_live_source: 'Não conectado',
    },
    activity: {
      none: 'Nenhuma atividade registrada',
      unavailable: 'Horário da atividade indisponível',
    },
    toolStatus: {
      free: 'Grátis',
      live: 'Ativo',
    },
    licenseEmailSubject: 'Licenciamento de módulos da SignalBoost',
  },
  pl: {
    languages: {
      en: 'Angielski',
      es: 'Hiszpański',
      pt: 'Portugalski',
      pl: 'Polski',
      ru: 'Rosyjski',
    },
    stats: {
      aria: 'Aktywność platformy na żywo',
      activePortables: 'Aktywne moduły przenośne',
      verifiedRows: 'Zweryfikowane wiersze',
      systemStatus: 'Stan systemu',
    },
    system: {
      active: 'Aktywny',
      idle: 'Bezczynny',
      degraded: 'Ograniczony',
      unreachable: 'Dane niedostępne',
      loading: 'Ładowanie',
    },
    runtime: {
      active: 'Aktywny',
      idle: 'Połączono · bezczynny',
      unreachable: 'Dane niedostępne',
      no_live_source: 'Brak połączenia',
    },
    activity: {
      none: 'Brak zarejestrowanej aktywności',
      unavailable: 'Czas aktywności niedostępny',
    },
    toolStatus: {
      free: 'Bezpłatne',
      live: 'Działa',
    },
    licenseEmailSubject: 'Licencjonowanie modułów SignalBoost',
  },
  ru: {
    languages: {
      en: 'Английский',
      es: 'Испанский',
      pt: 'Португальский',
      pl: 'Польский',
      ru: 'Русский',
    },
    stats: {
      aria: 'Активность платформы в реальном времени',
      activePortables: 'Активные переносимые модули',
      verifiedRows: 'Проверенные строки',
      systemStatus: 'Состояние системы',
    },
    system: {
      active: 'Активно',
      idle: 'Ожидание',
      degraded: 'Ограниченная работа',
      unreachable: 'Данные недоступны',
      loading: 'Загрузка',
    },
    runtime: {
      active: 'Активно',
      idle: 'Подключено · ожидание',
      unreachable: 'Данные недоступны',
      no_live_source: 'Не подключено',
    },
    activity: {
      none: 'Активность не зарегистрирована',
      unavailable: 'Время активности недоступно',
    },
    toolStatus: {
      free: 'Бесплатно',
      live: 'Работает',
    },
    licenseEmailSubject: 'Лицензирование модулей SignalBoost',
  },
}
