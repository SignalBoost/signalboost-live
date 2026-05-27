const COPY: Record<Lang, {
  badge: string
  title: string
  subtitle: string
  promise: string
  workshopTitle: string
  workshopTagline: string
  goalTitle: string
  goalItems: string[]
  examplesTitle: string
  pick: string
  experienceTitle: string
  experienceSubtitle: string
  start: string
  stepLabel: string
  beginner: string
  intermediate: string
  comfortable: string
  advanced: string
  noTech: string
  guided: string
  realOutput: string
  stepHints: {
    beginner: string
    intermediate: string
    comfortable: string
    advanced: string
  }
  nav: {
    promote: string
    site: string
    reviews: string
    audio: string
    video: string
    lab: string
  }
}> = {
  en: {
    badge: 'Apprentice Workshop',
    title: 'Learn while building.',
    subtitle: 'No technical experience needed. Choose what you want to create and SignalBoost will guide you one simple step at a time.',
    promise: 'Start from zero. Leave with something real.',
    workshopTitle: 'SignalBoost Apprentice Workshop',
    workshopTagline: 'Learn while building.',
    goalTitle: 'Goal',
    goalItems: ['Teach while creating','Guide step-by-step','Remove technical fear','Convert goals into workflows'],
    examplesTitle: 'Examples',
    pick: 'What do you want to build first?',
    experienceTitle: 'How much experience do you have?',
    experienceSubtitle: 'This helps SignalBoost decide how much explanation to show. You can change it later.',
    start: 'Start guide',
    stepLabel: 'First steps',
    beginner: 'Never used these tools',
    intermediate: 'A little experience',
    comfortable: 'Comfortable',
    advanced: 'Advanced',
    noTech: 'No technical terms first',
    guided: 'Simple guided steps',
    realOutput: 'Built into real SignalBoost tools',
    stepHints: {
      beginner: 'We’ll explain each step with simple examples.',
      intermediate: 'We’ll add quick tips and shortcuts.',
      comfortable: 'You’ll see concise steps without extra detail.',
      advanced: 'Just the checklist — no explanations.'
    },
    nav: {
      promote: 'Promote business',
      site: 'Create site',
      reviews: 'Collect reviews',
      audio: 'Generate audio',
      video: 'Create videos',
      lab: 'Lab'
    }
  },
  pt: {
    badge: 'Oficina de Aprendiz',
    title: 'Aprenda enquanto constrói.',
    subtitle: 'Não precisa ter experiência técnica. Escolha o que quer criar e a SignalBoost guia você passo a passo.',
    promise: 'Comece do zero. Termine com algo real.',
    workshopTitle: 'Oficina de Aprendiz SignalBoost',
    workshopTagline: 'Aprenda enquanto constrói.',
    goalTitle: 'Objetivo',
    goalItems: ['Ensinar enquanto cria','Guiar passo a passo','Remover medo técnico','Converter metas em fluxos'],
    examplesTitle: 'Exemplos',
    pick: 'O que você quer construir primeiro?',
    experienceTitle: 'Quanta experiência você tem?',
    experienceSubtitle: 'Isso ajuda a SignalBoost a decidir quanta explicação mostrar. Você pode mudar depois.',
    start: 'Começar guia',
    stepLabel: 'Primeiros passos',
    beginner: 'Nunca usei essas ferramentas',
    intermediate: 'Tenho um pouco de experiência',
    comfortable: 'Me sinto confortável',
    advanced: 'Avançado',
    noTech: 'Sem termos técnicos no começo',
    guided: 'Passos simples e guiados',
    realOutput: 'Conectado às ferramentas reais da SignalBoost',
    stepHints: {
      beginner: 'Explicaremos cada etapa com exemplos simples.',
      intermediate: 'Adicionaremos dicas rápidas e atalhos.',
      comfortable: 'Você verá etapas concisas sem detalhes extras.',
      advanced: 'Apenas a lista de verificação — sem explicações.'
    },
    nav: {
      promote: 'Promover negócio',
      site: 'Criar site',
      reviews: 'Coletar avaliações',
      audio: 'Gerar áudio',
      video: 'Criar vídeos',
      lab: 'Laboratório'
    }
  },
  es: {
    badge: 'Taller de Aprendiz',
    title: 'Aprende mientras construyes.',
    subtitle: 'No necesitas experiencia técnica. Elige lo que quieres crear y SignalBoost te guía paso a paso.',
    promise: 'Empieza desde cero. Termina con algo real.',
    workshopTitle: 'Taller de Aprendiz SignalBoost',
    workshopTagline: 'Aprende mientras construyes.',
    goalTitle: 'Objetivo',
    goalItems: ['Enseñar mientras creas','Guiar paso a paso','Eliminar el miedo técnico','Convertir metas en flujos'],
    examplesTitle: 'Ejemplos',
    pick: '¿Qué quieres construir primero?',
    experienceTitle: '¿Cuánta experiencia tienes?',
    experienceSubtitle: 'Esto ayuda a SignalBoost a decidir cuánta explicación mostrar. Puedes cambiarlo después.',
    start: 'Empezar guía',
    stepLabel: 'Primeros pasos',
    beginner: 'Nunca usé estas herramientas',
    intermediate: 'Tengo algo de experiencia',
    comfortable: 'Me siento cómodo',
    advanced: 'Avanzado',
    noTech: 'Sin términos técnicos al inicio',
    guided: 'Pasos simples y guiados',
    realOutput: 'Conectado a herramientas reales de SignalBoost',
    stepHints: {
      beginner: 'Explicaremos cada paso con ejemplos sencillos.',
      intermediate: 'Agregaremos consejos rápidos y atajos.',
      comfortable: 'Verás pasos concisos sin detalles adicionales.',
      advanced: 'Solo la lista de pasos — sin explicaciones.'
    },
    nav: {
      promote: 'Promocionar negocio',
      site: 'Crear sitio',
      reviews: 'Recopilar reseñas',
      audio: 'Generar audio',
      video: 'Crear videos',
      lab: 'Laboratorio'
    }
  },
  pl: {
    badge: 'Warsztat Ucznia',
    title: 'Ucz się, budując.',
    subtitle: 'Nie potrzebujesz doświadczenia technicznego. Wybierz, co chcesz stworzyć, a SignalBoost poprowadzi Cię krok po kroku.',
    promise: 'Zacznij od zera. Zakończ z czymś prawdziwym.',
    workshopTitle: 'Warsztat Ucznia SignalBoost',
    workshopTagline: 'Ucz się, budując.',
    goalTitle: 'Cel',
    goalItems: ['Uczyć podczas tworzenia','Prowadzić krok po kroku','Usunąć techniczny lęk','Zamieniać cele w przepływy pracy'],
    examplesTitle: 'Przykłady',
    pick: 'Co chcesz zbudować najpierw?',
    experienceTitle: 'Jakie masz doświadczenie?',
    experienceSubtitle: 'To pomaga SignalBoost dobrać poziom wyjaśnień. Możesz zmienić to później.',
    start: 'Rozpocznij przewodnik',
    stepLabel: 'Pierwsze kroki',
    beginner: 'Nigdy nie używałem tych narzędzi',
    intermediate: 'Mam trochę doświadczenia',
    comfortable: 'Czuję się pewnie',
    advanced: 'Zaawansowany',
    noTech: 'Bez technicznych terminów na start',
    guided: 'Proste kroki z prowadzeniem',
    realOutput: 'Połączone z prawdziwymi narzędziami SignalBoost',
    stepHints: {
      beginner: 'Wyjaśnimy każdy krok prostymi przykładami.',
      intermediate: 'Dodamy szybkie wskazówki i skróty.',
      comfortable: 'Zobaczysz zwięzłe kroki bez dodatkowych szczegółów.',
      advanced: 'Tylko lista kroków — bez wyjaśnień.'
    },
    nav: {
      promote: 'Promować biznes',
      site: 'Stworzyć stronę',
      reviews: 'Zbierać opinie',
      audio: 'Generować audio',
      video: 'Tworzyć filmy',
      lab: 'Laboratorium'
    }
  },
  ru: {
    badge: 'Мастерская ученика',
    title: 'Учитесь, создавая.',
    subtitle: 'Технический опыт не нужен. Выберите, что хотите создать, и SignalBoost проведёт вас простыми шагами.',
    promise: 'Начните с нуля. Получите реальный результат.',
    workshopTitle: 'Мастерская ученика SignalBoost',
    workshopTagline: 'Учитесь, создавая.',
    goalTitle: 'Цель',
    goalItems: ['Учить в процессе создания','Вести шаг за шагом','Убрать технический страх','Преобразовывать цели в рабочие процессы'],
    examplesTitle: 'Примеры',
