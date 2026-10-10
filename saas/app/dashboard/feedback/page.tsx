'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabase/client'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

const BLUE = '#3b82f6'
const GOLD = '#ffc300'

type Feedback = {
  id: string
  rating: number
  category: string
  message: string
  page: string
  status: string
  created_at: string
  user_id: string
}

type FeedbackCopy = {
  title: string
  subtitle: string
  submitTab: string
  boardTab: string
  thankYou: string
  thankYouMessage: string
  submitMore: string
  viewBoard: string
  ratingLabel: string
  categoryLabel: string
  messageLabel: string
  placeholders: Record<string, string>
  characters: string
  notice: string
  submitting: string
  submit: string
  communityFeedback: string
  all: string
  loading: string
  emptyTitle: string
  emptyText: string
  you: string
  time: {
    days: string
    hours: string
    mins: string
    ago: string
    now: string
  }
  ratings: string[]
  categories: Array<{
    id: string
    icon: string
    label: string
    desc: string
  }>
  statuses: Record<string, string>
}

const COPY: Record<string, FeedbackCopy> = {
  en: {
    title: uiText('generatedUi.u_aac77df347205252'),
    subtitle: uiText('generatedUi.u_fae6a5db7a1b9283'),
    submitTab: uiText('generatedUi.u_8962a6170c69391b'),
    boardTab: uiText('generatedUi.u_9f4e3b92825e7441'),
    thankYou: uiText('generatedUi.u_268bc1833e83306f'),
    thankYouMessage: uiText('generatedUi.u_1fb1c3075c61de42'),
    submitMore: uiText('generatedUi.u_a8cbc7b907eddc7c'),
    viewBoard: uiText('generatedUi.u_5730d14535a91791'),
    ratingLabel: uiText('generatedUi.u_47fd32e33dde3eec'),
    categoryLabel: uiText('generatedUi.u_e53b8ffde6ebf331'),
    messageLabel: uiText('generatedUi.u_ed0adc55f2bd07e9'),
    placeholders: {
      bug: uiText('generatedUi.u_e01f6b27387d47eb'),
      feature: uiText('generatedUi.u_3d4675041d69e9b4'),
      praise: uiText('generatedUi.u_91afafffdf840203'),
      general: uiText('generatedUi.u_8ebcc11fe101846f'),
    },
    characters: uiText('generatedUi.u_25d939ffd0d79b73'),
    notice: uiText('generatedUi.u_ee307eda893a2f47'),
    submitting: uiText('generatedUi.u_64115d5b9c794c92'),
    submit: uiText('generatedUi.u_4a101ec79a35b0a2'),
    communityFeedback: uiText('generatedUi.u_9af058b7a53bac6f'),
    all: uiText('generatedUi.u_a52ace420f2175d0'),
    loading: uiText('generatedUi.u_94ec56d35dc6b595'),
    emptyTitle: uiText('generatedUi.u_725e906827e67868'),
    emptyText: uiText('generatedUi.u_903508a31e9f2ea8'),
    you: uiText('generatedUi.u_08b041935798fbf6'),
    time: { days: 'd', hours: 'h', mins: 'm', ago: uiText('generatedUi.u_1d8e08fd63268284'), now: uiText('generatedUi.u_66f53417d3b7797a') },
    ratings: ['', uiText('generatedUi.u_94dfd46d9dae63e6'), uiText('generatedUi.u_f7b19afcde965ea4'), uiText('generatedUi.u_c939327ca16dcf97'), uiText('generatedUi.u_c8cc1c7bb662fcb4'), uiText('generatedUi.u_1e5b9c4d7c7853fa')],
    categories: [
      { id: "praise", icon: '🎉', label: uiText('generatedUi.u_2a9c05a07ef497af'), desc: uiText('generatedUi.u_61c27afa86663280') },
      { id: "feature", icon: '💡', label: uiText('generatedUi.u_89ee3fcc460b5443'), desc: uiText('generatedUi.u_9edc836f3d294331') },
      { id: "bug", icon: '🐛', label: uiText('generatedUi.u_a79b02e8595f17a8'), desc: uiText('generatedUi.u_6fb8f3971ce8b229') },
      { id: "general", icon: '💬', label: uiText('generatedUi.u_c910d474dcd724bf'), desc: uiText('generatedUi.u_5e48ed88e62d8d0d') },
    ],
    statuses: {
      new: uiText('generatedUi.u_18fdd549b2ed367a'),
      reviewing: uiText('generatedUi.u_9e8a3b648cf75788'),
      planned: uiText('generatedUi.u_fb6f7c93e6bf3dfa'),
      done: uiText('generatedUi.u_11a6767d5674c7e4'),
    },
  },

  pt: {
    title: 'Feedback',
    subtitle: 'Ajude-nos a melhorar o SignalBoost. Seu feedback vai diretamente para Luis.',
    submitTab: '✍️ Enviar feedback',
    boardTab: '📋 Painel de feedback',
    thankYou: 'Obrigado',
    thankYouMessage: 'Seu feedback foi recebido. Luis lê pessoalmente cada envio.',
    submitMore: 'Enviar mais feedback',
    viewBoard: 'Ver painel de feedback',
    ratingLabel: 'Como você avalia o SignalBoost no geral? *',
    categoryLabel: 'Que tipo de feedback é este? *',
    messageLabel: 'Seu feedback *',
    placeholders: {
      bug: 'Descreva o que aconteceu e o que você esperava que acontecesse...',
      feature: 'Descreva o recurso que você gostaria de ver...',
      praise: 'Conte o que você gosta no SignalBoost...',
      general: 'Compartilhe seus pensamentos...',
    },
    characters: 'caracteres',
    notice: '💡 Seu feedback fica visível para outros usuários do SignalBoost no painel de feedback. Isso ajuda todos a verem o que está sendo trabalhado. Não inclua informações pessoais ou sensíveis.',
    submitting: 'Enviando...',
    submit: 'Enviar feedback',
    communityFeedback: 'Feedback da comunidade',
    all: 'Todos',
    loading: 'Carregando feedback...',
    emptyTitle: 'Ainda não há feedback',
    emptyText: 'Seja o primeiro a compartilhar sua opinião!',
    you: 'Você',
    time: { days: 'd', hours: 'h', mins: 'min', ago: 'atrás', now: 'Agora mesmo' },
    ratings: ['', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Elogio', desc: 'Algo que você gosta no SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Pedido de recurso', desc: 'Algo que você gostaria que o SignalBoost fizesse' },
      { id: 'bug', icon: '🐛', label: 'Relato de bug', desc: 'Algo que não está funcionando corretamente' },
      { id: 'general', icon: '💬', label: 'Geral', desc: 'Qualquer outra coisa que esteja em sua mente' },
    ],
    statuses: {
      new: 'Novo',
      reviewing: 'Em análise',
      planned: 'Planejado',
      done: 'Concluído',
    },
  },

  es: {
    title: 'Comentarios',
    subtitle: 'Ayúdanos a mejorar SignalBoost. Tus comentarios van directamente a Luis.',
    submitTab: '✍️ Enviar comentario',
    boardTab: '📋 Panel de comentarios',
    thankYou: 'Gracias',
    thankYouMessage: 'Hemos recibido tu comentario. Luis lee personalmente cada envío.',
    submitMore: 'Enviar más comentarios',
    viewBoard: 'Ver panel de comentarios',
    ratingLabel: '¿Cómo calificarías SignalBoost en general? *',
    categoryLabel: '¿Qué tipo de comentario es este? *',
    messageLabel: 'Tu comentario *',
    placeholders: {
      bug: 'Describe qué ocurrió y qué esperabas que ocurriera...',
      feature: 'Describe la función que te gustaría ver...',
      praise: 'Cuéntanos qué te gusta de SignalBoost...',
      general: 'Comparte tus ideas...',
    },
    characters: 'caracteres',
    notice: '💡 Tu comentario será visible para otros usuarios de SignalBoost en el panel de comentarios. Esto ayuda a todos a ver en qué se está trabajando. No incluyas información personal o sensible.',
    submitting: 'Enviando...',
    submit: 'Enviar comentario',
    communityFeedback: 'Comentarios de la comunidad',
    all: 'Todos',
    loading: 'Cargando comentarios...',
    emptyTitle: 'Aún no hay comentarios',
    emptyText: '¡Sé el primero en compartir tu opinión!',
    you: 'Tú',
    time: { days: 'd', hours: 'h', mins: 'min', ago: 'atrás', now: 'Ahora mismo' },
    ratings: ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', '¡Excelente!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Elogio', desc: 'Algo que te encanta de SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Solicitud de función', desc: 'Algo que te gustaría que SignalBoost pudiera hacer' },
      { id: 'bug', icon: '🐛', label: 'Reporte de error', desc: 'Algo que no funciona correctamente' },
      { id: 'general', icon: '💬', label: 'General', desc: 'Cualquier otra cosa que tengas en mente' },
    ],
    statuses: {
      new: 'Nuevo',
      reviewing: 'En revisión',
      planned: 'Planeado',
      done: 'Hecho',
    },
  },

  pl: {
    title: 'Opinie',
    subtitle: 'Pomóż ulepszać SignalBoost. Twoja opinia trafia bezpośrednio do Luisa.',
    submitTab: '✍️ Prześlij opinię',
    boardTab: '📋 Tablica opinii',
    thankYou: 'Dziękujemy',
    thankYouMessage: 'Twoja opinia została odebrana. Luis osobiście czyta każde zgłoszenie.',
    submitMore: 'Prześlij kolejną opinię',
    viewBoard: 'Zobacz tablicę opinii',
    ratingLabel: 'Jak ogólnie oceniasz SignalBoost? *',
    categoryLabel: 'Jakiego typu jest ta opinia? *',
    messageLabel: 'Twoja opinia *',
    placeholders: {
      bug: 'Opisz, co się stało i czego oczekiwałeś...',
      feature: 'Opisz funkcję, którą chcesz zobaczyć...',
      praise: 'Powiedz nam, co lubisz w SignalBoost...',
      general: 'Podziel się swoimi myślami...',
    },
    characters: 'znaków',
    notice: '💡 Twoja opinia jest widoczna dla innych użytkowników SignalBoost na tablicy opinii. Nie podawaj informacji osobistych ani poufnych.',
    submitting: 'Wysyłanie...',
    submit: 'Prześlij opinię',
    communityFeedback: 'Opinie społeczności',
    all: 'Wszystkie',
    loading: 'Ładowanie opinii...',
    emptyTitle: 'Brak opinii',
    emptyText: 'Bądź pierwszą osobą, która podzieli się opinią!',
    you: 'Ty',
    time: { days: 'd', hours: 'g', mins: 'min', ago: 'temu', now: 'Teraz' },
    ratings: ['', 'Słabo', 'Średnio', 'Dobrze', 'Bardzo dobrze', 'Doskonale!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Pochwała', desc: 'Coś, co lubisz w SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Prośba o funkcję', desc: 'Coś, czego brakuje w SignalBoost' },
      { id: 'bug', icon: '🐛', label: 'Błąd', desc: 'Coś, co nie działa poprawnie' },
      { id: 'general', icon: '💬', label: 'Ogólne', desc: 'Inne uwagi lub pomysły' },
    ],
    statuses: {
      new: 'Nowe',
      reviewing: 'W trakcie analizy',
      planned: 'Zaplanowane',
      done: 'Gotowe',
    },
  },

  ru: {
    title: 'Обратная связь',
    subtitle: 'Помогите улучшить SignalBoost. Ваш отзыв попадет напрямую к Луису.',
    submitTab: '✍️ Отправить отзыв',
    boardTab: '📋 Доска отзывов',
    thankYou: 'Спасибо',
    thankYouMessage: 'Ваш отзыв получен. Луис лично читает каждую отправку.',
    submitMore: 'Отправить еще отзыв',
    viewBoard: 'Посмотреть доску отзывов',
    ratingLabel: 'Как вы в целом оцениваете SignalBoost? *',
    categoryLabel: 'Какой это тип отзыва? *',
    messageLabel: 'Ваш отзыв *',
    placeholders: {
      bug: 'Опишите, что произошло и что вы ожидали...',
      feature: 'Опишите функцию, которую хотели бы видеть...',
      praise: 'Расскажите, что вам нравится в SignalBoost...',
      general: 'Поделитесь своими мыслями...',
    },
    characters: 'символов',
    notice: '💡 Ваш отзыв виден другим пользователям SignalBoost на доске отзывов. Не указывайте личную или конфиденциальную информацию.',
    submitting: 'Отправка...',
    submit: 'Отправить отзыв',
    communityFeedback: 'Отзывы сообщества',
    all: 'Все',
    loading: 'Загрузка отзывов...',
    emptyTitle: 'Пока нет отзывов',
    emptyText: 'Будьте первым, кто поделится мнением!',
    you: 'Вы',
    time: { days: 'д', hours: 'ч', mins: 'мин', ago: 'назад', now: 'Только что' },
    ratings: ['', 'Плохо', 'Так себе', 'Хорошо', 'Отлично', 'Превосходно!'],
    categories: [
      { id: 'praise', icon: '🎉', label: 'Похвала', desc: 'Что вам нравится в SignalBoost' },
      { id: 'feature', icon: '💡', label: 'Запрос функции', desc: 'Что вы хотите видеть в SignalBoost' },
      { id: 'bug', icon: '🐛', label: 'Сообщение об ошибке', desc: 'Что работает неправильно' },
      { id: 'general', icon: '💬', label: 'Общее', desc: 'Любые другие мысли' },
    ],
    statuses: {
      new: 'Новый',
      reviewing: 'На рассмотрении',
      planned: 'Запланировано',
      done: 'Готово',
    },
  },
  de: {
    title: 'Feedback',
    subtitle: 'Helfen Sie uns, SignalBoost besser zu machen. Ihr Feedback geht direkt an Luis.',
    submitTab: '✍️ Feedback senden',
    boardTab: '📋 Feedback-Board',
    thankYou: 'Vielen Dank',
    thankYouMessage: 'Ihr Feedback ist eingegangen. Luis liest jede einzelne Einsendung persönlich.',
    submitMore: 'Weiteres Feedback senden',
    viewBoard: 'Feedback-Board anzeigen',
    ratingLabel: 'Wie bewerten Sie SignalBoost insgesamt? *',
    categoryLabel: 'Welche Art von Feedback ist das? *',
    messageLabel: 'Ihr Feedback *',
    placeholders: {
      bug: 'Beschreiben Sie, was passiert ist und was Sie erwartet haben...',
      feature: 'Beschreiben Sie die Funktion, die Sie sich wünschen...',
      praise: 'Sagen Sie uns, was Ihnen an SignalBoost gefällt …',
      general: 'Teilen Sie Ihre Gedanken …',
    },
    characters: 'Zeichen',
    notice: '💡 Ihr Feedback ist für andere SignalBoost-Nutzer auf dem Feedback-Board sichtbar. So sieht jeder, woran gerade gearbeitet wird. Geben Sie keine persönlichen oder sensiblen Informationen an.',
    submitting: 'Wird gesendet...',
    submit: 'Feedback senden',
    communityFeedback: 'Community-Feedback',
    all: 'Alle',
    loading: 'Feedback wird geladen …',
    emptyTitle: 'Noch kein Feedback',
    emptyText: 'Teilen Sie als Erste/r Ihre Gedanken!',
    you: 'Sie',
    time: { days: 'T', hours: 'Std.', mins: 'Min.', ago: 'her', now: 'Gerade eben' },
    ratings: ['', 'Schlecht', 'Mittelmäßig', 'Gut', 'Sehr gut', 'Ausgezeichnet!'],
    categories: [
      { id: "praise", icon: '🎉', label: 'Lob', desc: 'Etwas, das Sie an SignalBoost lieben' },
      { id: "feature", icon: '💡', label: 'Funktionswunsch', desc: 'Etwas, das SignalBoost Ihrer Meinung nach können sollte' },
      { id: "bug", icon: '🐛', label: 'Fehlerbericht', desc: 'Etwas, das nicht richtig funktioniert' },
      { id: "general", icon: '💬', label: 'Allgemein', desc: 'Was Ihnen sonst noch auf dem Herzen liegt' },
    ],
    statuses: {
      new: 'Neu',
      reviewing: 'In Prüfung',
      planned: 'Geplant',
      done: 'Fertig',
    },
  },
  fr: {
    title: 'Commentaires',
    subtitle: 'Aidez-nous à améliorer SignalBoost. Vos commentaires sont transmis directement à Luis.',
    submitTab: '✍️ Envoyer un commentaire',
    boardTab: '📋 Tableau des retours',
    thankYou: 'Merci',
    thankYouMessage: 'Vos commentaires ont bien été reçus. Luis lit personnellement chaque envoi.',
    submitMore: 'Envoyer d’autres commentaires',
    viewBoard: 'Voir le tableau des avis',
    ratingLabel: 'Comment évaluez-vous SignalBoost dans l’ensemble ? *',
    categoryLabel: 'De quel type de retour s’agit-il ? *',
    messageLabel: 'Vos commentaires *',
    placeholders: {
      bug: 'Décrivez ce qui s’est passé et ce que vous attendiez...',
      feature: 'Décrivez la fonctionnalité que vous aimeriez voir...',
      praise: 'Dites-nous ce que vous aimez dans SignalBoost…',
      general: 'Partagez votre avis…',
    },
    characters: 'caractères',
    notice: '💡 Vos commentaires sont visibles par les autres utilisateurs de SignalBoost sur le tableau des commentaires. Cela permet à chacun de voir ce qui est en cours. N\'incluez aucune information personnelle ou sensible.',
    submitting: 'Envoi...',
    submit: 'Envoyer un avis',
    communityFeedback: 'Avis de la communauté',
    all: 'Tous',
    loading: 'Chargement des commentaires…',
    emptyTitle: 'Aucun retour pour l\'instant',
    emptyText: 'Soyez le premier à partager votre avis !',
    you: 'Vous',
    time: { days: 'j', hours: 'h', mins: 'min', ago: 'il y a', now: 'À l’instant' },
    ratings: ['', 'Médiocre', 'Passable', 'Bon', 'Excellent', 'Excellent !'],
    categories: [
      { id: "praise", icon: '🎉', label: 'Éloges', desc: 'Ce que vous aimez dans SignalBoost' },
      { id: "feature", icon: '💡', label: 'Demande de fonctionnalité', desc: 'Une fonctionnalité que vous aimeriez voir dans SignalBoost' },
      { id: "bug", icon: '🐛', label: 'Signalement de bug', desc: 'Quelque chose qui ne fonctionne pas correctement' },
      { id: "general", icon: '💬', label: 'Général', desc: 'Autre chose à nous dire' },
    ],
    statuses: {
      new: 'Nouveau',
      reviewing: 'En cours d\'examen',
      planned: 'Planifié',
      done: 'Terminé',
    },
  },
  it: {
    title: 'Feedback',
    subtitle: 'Aiutaci a migliorare SignalBoost. Il tuo feedback arriva direttamente a Luis.',
    submitTab: '✍️ Invia feedback',
    boardTab: '📋 Bacheca dei feedback',
    thankYou: 'Grazie',
    thankYouMessage: 'Il tuo feedback è stato ricevuto. Luis legge personalmente ogni singolo invio.',
    submitMore: 'Invia altro feedback',
    viewBoard: 'Visualizza bacheca feedback',
    ratingLabel: 'Come valuti SignalBoost nel complesso? *',
    categoryLabel: 'Che tipo di feedback è questo? *',
    messageLabel: 'Il tuo feedback *',
    placeholders: {
      bug: 'Descrivi cosa è successo e cosa ti aspettavi...',
      feature: 'Descrivi la funzionalità che vorresti vedere...',
      praise: 'Raccontaci cosa ti piace di SignalBoost...',
      general: 'Condividi i tuoi pensieri...',
    },
    characters: 'caratteri',
    notice: '💡 Il tuo feedback è visibile agli altri utenti di SignalBoost nella bacheca dei feedback. Così tutti possono vedere su cosa si sta lavorando. Non includere informazioni personali o sensibili.',
    submitting: 'Invio...',
    submit: 'Invia feedback',
    communityFeedback: 'Feedback della community',
    all: 'Tutti',
    loading: 'Caricamento feedback...',
    emptyTitle: 'Ancora nessun feedback',
    emptyText: 'Condividi per primo i tuoi pensieri!',
    you: 'Tu',
    time: { days: 'g', hours: 'h', mins: 'min', ago: 'fa', now: 'Proprio ora' },
    ratings: ['', 'Scarso', 'Discreto', 'Buono', 'Ottimo', 'Eccellente!'],
    categories: [
      { id: "praise", icon: '🎉', label: 'Elogi', desc: 'Qualcosa che ami di SignalBoost' },
      { id: "feature", icon: '💡', label: 'Richiesta di funzionalità', desc: 'Qualcosa che vorresti che SignalBoost sapesse fare' },
      { id: "bug", icon: '🐛', label: 'Segnalazione di bug', desc: 'Qualcosa che non funziona correttamente' },
      { id: "general", icon: '💬', label: 'Generale', desc: 'Qualcos’altro che vuoi dirci' },
    ],
    statuses: {
      new: 'Nuovo',
      reviewing: 'In revisione',
      planned: 'Pianificato',
      done: 'Fatto',
    },
  },
  ja: {
    title: 'フィードバック',
    subtitle: 'SignalBoost の改善にご協力ください。フィードバックは Luis に直接届きます。',
    submitTab: '✍️ フィードバックを送信',
    boardTab: '📋 フィードバックボード',
    thankYou: 'ありがとうございます',
    thankYouMessage: 'フィードバックを受け付けました。Luis がすべての投稿に自ら目を通します。',
    submitMore: 'さらにフィードバックを送信',
    viewBoard: 'フィードバックボードを表示',
    ratingLabel: 'SignalBoost の総合評価をお聞かせください。*',
    categoryLabel: 'どの種類のフィードバックですか？ *',
    messageLabel: 'フィードバック *',
    placeholders: {
      bug: '何が起きたか、何を期待していたかを説明してください...',
      feature: 'ご希望の機能を説明してください...',
      praise: 'SignalBoost の気に入っている点を教えてください...',
      general: 'ご意見をお聞かせください...',
    },
    characters: '文字',
    notice: '💡 フィードバックはフィードバックボード上で他の SignalBoost ユーザーにも表示されます。これにより、何に取り組んでいるかを全員が確認できます。個人情報や機密情報は含めないでください。',
    submitting: '送信中...',
    submit: 'フィードバックを送信',
    communityFeedback: 'コミュニティのフィードバック',
    all: 'すべて',
    loading: 'フィードバックを読み込み中...',
    emptyTitle: 'フィードバックはまだありません',
    emptyText: '最初にご意見をお寄せください！',
    you: 'あなた',
    time: { days: '日', hours: '時間', mins: '分', ago: '前', now: 'たった今' },
    ratings: ['', '不良', 'まずまず', '良い', 'とても良い', '素晴らしい！'],
    categories: [
      { id: "praise", icon: '🎉', label: '称賛', desc: 'SignalBoost の好きなところ' },
      { id: "feature", icon: '💡', label: '機能リクエスト', desc: 'SignalBoost にできてほしいこと' },
      { id: "bug", icon: '🐛', label: 'バグ報告', desc: '正しく動作していないもの' },
      { id: "general", icon: '💬', label: '一般', desc: 'その他、お考えのこと' },
    ],
    statuses: {
      new: '新規',
      reviewing: '審査中',
      planned: '予定',
      done: '完了',
    },
  },
  ko: {
    title: '피드백',
    subtitle: 'SignalBoost를 더 좋게 만드는 데 도움을 주세요. 피드백은 Luis에게 직접 전달됩니다.',
    submitTab: '✍️ 피드백 제출',
    boardTab: '📋 피드백 보드',
    thankYou: '감사합니다',
    thankYouMessage: '피드백이 접수되었습니다. Luis가 모든 제출 내용을 직접 읽습니다.',
    submitMore: '추가 피드백 보내기',
    viewBoard: '피드백 보드 보기',
    ratingLabel: 'SignalBoost를 전반적으로 어떻게 평가하시겠습니까? *',
    categoryLabel: '어떤 유형의 피드백인가요? *',
    messageLabel: '피드백 *',
    placeholders: {
      bug: '무슨 일이 있었는지, 무엇을 기대했는지 설명해 주세요...',
      feature: '원하는 기능을 설명해 주세요...',
      praise: 'SignalBoost의 마음에 드는 점을 알려 주세요...',
      general: '의견을 공유하세요...',
    },
    characters: '자',
    notice: '💡 피드백은 피드백 보드에서 다른 SignalBoost 사용자에게 표시됩니다. 이를 통해 모두가 현재 진행 중인 작업을 확인할 수 있습니다. 개인 정보나 민감한 정보는 포함하지 마세요.',
    submitting: '제출 중...',
    submit: '피드백 제출',
    communityFeedback: '커뮤니티 피드백',
    all: '전체',
    loading: '피드백 불러오는 중...',
    emptyTitle: '아직 피드백이 없습니다',
    emptyText: '가장 먼저 의견을 공유해 보세요!',
    you: '나',
    time: { days: '일', hours: '시간', mins: '분', ago: '전', now: '방금' },
    ratings: ['', '미흡', '보통', '좋음', '매우 좋음', '훌륭합니다!'],
    categories: [
      { id: "praise", icon: '🎉', label: '칭찬', desc: 'SignalBoost에서 마음에 드는 점' },
      { id: "feature", icon: '💡', label: '기능 요청', desc: 'SignalBoost가 해 주었으면 하는 기능' },
      { id: "bug", icon: '🐛', label: '버그 보고', desc: '제대로 작동하지 않는 항목' },
      { id: "general", icon: '💬', label: '일반', desc: '그 밖에 하고 싶은 말' },
    ],
    statuses: {
      new: '새로 만들기',
      reviewing: '검토 중',
      planned: '계획됨',
      done: '완료',
    },
  },
  ar: {
    title: 'الملاحظات',
    subtitle: 'ساعدنا في تحسين SignalBoost. تصل ملاحظاتك مباشرة إلى Luis.',
    submitTab: '✍️ إرسال الملاحظات',
    boardTab: '📋 لوحة الملاحظات',
    thankYou: 'شكرًا لك',
    thankYouMessage: 'تم استلام ملاحظاتك. يقرأ Luis كل مشاركة بنفسه.',
    submitMore: 'إرسال مزيد من الملاحظات',
    viewBoard: 'عرض لوحة الملاحظات',
    ratingLabel: 'كيف تقيّم SignalBoost بشكل عام؟ *',
    categoryLabel: 'ما نوع هذه الملاحظات؟ *',
    messageLabel: 'ملاحظاتك *',
    placeholders: {
      bug: 'صف ما حدث وما كنت تتوقع حدوثه...',
      feature: 'صِف الميزة التي تودّ رؤيتها...',
      praise: 'أخبرنا بما تحبه في SignalBoost...',
      general: 'شارك أفكارك...',
    },
    characters: 'حرفًا',
    notice: '💡 ملاحظاتك مرئية لمستخدمي SignalBoost الآخرين على لوحة الملاحظات. يساعد ذلك الجميع على معرفة ما يجري العمل عليه. لا تُدرج أي معلومات شخصية أو حساسة.',
    submitting: 'جارٍ الإرسال...',
    submit: 'إرسال الملاحظات',
    communityFeedback: 'ملاحظات المجتمع',
    all: 'الكل',
    loading: 'جارٍ تحميل الملاحظات...',
    emptyTitle: 'لا توجد ملاحظات بعد',
    emptyText: 'كن أول من يشارك أفكاره!',
    you: 'أنت',
    time: { days: 'ي', hours: 'س', mins: 'د', ago: 'مضت', now: 'الآن' },
    ratings: ['', 'ضعيف', 'مقبول', 'جيد', 'ممتاز', 'ممتاز!'],
    categories: [
      { id: "praise", icon: '🎉', label: 'الإشادة', desc: 'شيء تحبه في SignalBoost' },
      { id: "feature", icon: '💡', label: 'طلب ميزة', desc: 'شيء تتمنى أن يتمكن SignalBoost من فعله' },
      { id: "bug", icon: '🐛', label: 'الإبلاغ عن خطأ', desc: 'شيء لا يعمل بشكل صحيح' },
      { id: "general", icon: '💬', label: 'عام', desc: 'أي شيء آخر يدور في ذهنك' },
    ],
    statuses: {
      new: 'جديد',
      reviewing: 'قيد المراجعة',
      planned: 'مخطط',
      done: 'تم',
    },
  },
}

const STATUS_COLORS: Record<string, string> = {
  new: 'rgba(255,255,255,0.3)',
  reviewing: '#ffc300',
  planned: '#3b82f6',
  done: '#4ade80',
}

type CopyLang = keyof typeof COPY

function getCopy(lang: string): FeedbackCopy {
  return COPY[lang as CopyLang] || COPY.en
}

export default function FeedbackPage() {
  const { lang } = useI18n()
  const copy = getCopy(lang)

  const [tab, setTab] = useState<'submit' | 'board'>('submit')
  const [boardPage, setBoardPage] = useState(0)
  const [boardPageSize, setBoardPageSize] = useState(4)

  // Fit whole feedback rows to the screen, never a cut one.
  useEffect(() => {
    function recalc() {
      setBoardPageSize(Math.max(1, Math.floor((window.innerHeight - 330) / 130)))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [category, setCategory] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id)
        const meta = data.user.user_metadata
        const fullName = meta?.full_name || meta?.name || ''
        setUserName(fullName.split(' ')[0] || '')
      }
    })
  }, [])

  useEffect(() => {
    if (tab === 'board') loadFeedback()
  }, [tab])

  async function loadFeedback() {
    setLoadingFeedback(true)

    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setAllFeedback(data)

    setLoadingFeedback(false)
  }

  async function handleSubmit() {
    if (!message.trim() || !category || rating === 0) return

    setSubmitting(true)

    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      rating,
      category,
      message: message.trim(),
      page: window.location.pathname,
      status: 'new',
    })

    if (!error) {
      setSubmitted(true)
      setMessage('')
      setRating(0)
      setCategory('')
    }

    setSubmitting(false)
  }

  function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}${copy.time.days} ${copy.time.ago}`
    if (hours > 0) return `${hours}${copy.time.hours} ${copy.time.ago}`
    if (mins > 0) return `${mins}${copy.time.mins} ${copy.time.ago}`

    return copy.time.now
  }

  const filtered =
    filterCategory === 'all'
      ? allFeedback
      : allFeedback.filter((feedback) => feedback.category === filterCategory)

  const selectedPlaceholder =
    copy.placeholders[category] || copy.placeholders.general

  return (
    <div style={{ color: '#fff', fontFamily: 'system-ui' }}>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
          💬 {copy.title}
        </h1>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
          {copy.subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: "submit", label: copy.submitTab },
          { id: "board", label: `${copy.boardTab} ${allFeedback.length > 0 ? `(${allFeedback.length})` : ''}` },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id as 'submit' | 'board')}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: tab === item.id ? BLUE : 'transparent',
              color: tab === item.id ? '#fff' : 'rgba(255,255,255,0.45)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'submit' && (
        <div style={{ maxWidth: 580 }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '40px 0', borderTop: '1px solid rgba(74,222,128,0.35)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>

              <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
                {copy.thankYou}{userName ? `, ${userName}` : ''}!
              </h2>

              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                {copy.thankYouMessage}
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => setSubmitted(false)}
                  style={{ background: BLUE, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}
                >
                  {copy.submitMore}
                </button>

                <button
                  onClick={() => {
                    setSubmitted(false)
                    setTab('board')
                    loadFeedback()
                  }}
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                >
                  {copy.viewBoard}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  {copy.ratingLabel}
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 19,
                        background: (hoveredRating || rating) >= star ? 'rgba(255,195,0,0.15)' : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {(hoveredRating || rating) >= star ? '★' : '☆'}
                    </button>
                  ))}

                  {rating > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', marginInlineStart: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}>
                      {copy.ratings[rating]}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  {copy.categoryLabel}
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                  {copy.categories.map((cat) => (
                    <div
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      title={cat.desc}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: category === cat.id ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${category === cat.id ? BLUE : 'rgba(255,255,255,0.07)'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{cat.icon}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{cat.label}</span>
                        {category === cat.id && <span style={{ marginInlineStart: 'auto', color: BLUE }}>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 8 }}>
                  {copy.messageLabel}
                </label>

                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={selectedPlaceholder}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'system-ui',
                    lineHeight: 1.6,
                  }}
                  onFocus={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'
                  }}
                  onBlur={(event) => {
                    event.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  }}
                />

                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
                  {message.length} {copy.characters}
                </div>
              </div>

              <div style={{ borderInlineStart: '2px solid rgba(255,195,0,0.5)', paddingInlineStart: 14, marginBottom: 14, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                {copy.notice}
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !message.trim() || !category || rating === 0}
                style={{
                  background: !message.trim() || !category || rating === 0 ? 'rgba(255,255,255,0.05)' : GOLD,
                  color: !message.trim() || !category || rating === 0 ? 'rgba(255,255,255,0.3)' : '#000',
                  fontWeight: 800,
                  fontSize: 14,
                  padding: '13px 36px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: !message.trim() || !category || rating === 0 ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? copy.submitting : copy.submit}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'board' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{copy.communityFeedback}</h2>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[{ id: "all", label: copy.all }, ...copy.categories.map((cat) => ({ id: cat.id, label: `${cat.icon} ${cat.label}` }))].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setFilterCategory(filter.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: filterCategory === filter.id ? BLUE : 'rgba(255,255,255,0.05)',
                    color: filterCategory === filter.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {loadingFeedback ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)' }}>
              {copy.loading}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{copy.emptyTitle}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>{copy.emptyText}</div>

              <button
                onClick={() => setTab('submit')}
                style={{ background: BLUE, color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 24px', borderRadius: 999, border: 'none', cursor: 'pointer' }}
              >
                {copy.submit}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.slice(boardPage * boardPageSize, boardPage * boardPageSize + boardPageSize).map((item) => {
                const cat = copy.categories.find((categoryItem) => categoryItem.id === item.category)
                const isOwn = item.user_id === userId
                const statusLabel = copy.statuses[item.status] || item.status

                return (
                  <div
                    key={item.id}
                    style={{
                      borderTop: '1px solid rgba(255,255,255,0.07)',
                      borderInlineStart: isOwn ? '2px solid rgba(59,130,246,0.6)' : '2px solid rgba(255,255,255,0.1)',
                      padding: '14px 0 14px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18 }}>{cat?.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {cat?.label}
                        </span>

                        <div style={{ display: 'flex', gap: 2 }}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} style={{ fontSize: 12, color: star <= item.rating ? GOLD : 'rgba(255,255,255,0.15)' }}>
                              ★
                            </span>
                          ))}
                        </div>

                        {isOwn && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 999, padding: '2px 8px' }}>
                            {copy.you}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: STATUS_COLORS[item.status] || 'rgba(255,255,255,0.4)' }}>
                          {statusLabel}
                        </span>

                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                          {timeAgo(item.created_at)}
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>
                      {item.message}
                    </p>
                  </div>
                )
              })}
              {filtered.length > boardPageSize ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 8, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10 }}>
                  <button type="button" onClick={() => setBoardPage(boardPage - 1)} disabled={boardPage === 0} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '6px 16px', cursor: 'pointer', opacity: boardPage === 0 ? .4 : 1 }}>‹</button>
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{boardPage + 1} / {Math.max(1, Math.ceil(filtered.length / boardPageSize))}</span>
                  <button type="button" onClick={() => setBoardPage(boardPage + 1)} disabled={(boardPage + 1) * boardPageSize >= filtered.length} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '6px 16px', cursor: 'pointer', opacity: (boardPage + 1) * boardPageSize >= filtered.length ? .4 : 1 }}>›</button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
