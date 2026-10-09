// saas/lib/cos-marketing-sales/printDeskPayloadMapper.ts
// Traditional print desk payload mapper.
// Local papers and magazines often use email-based ad desks instead of APIs;
// this class compiles a unified submission payload for owner approval.

import type { CosLocale, PrintAssetMetadata, PrintDeskContact, PrintDeskPayload, PrintDimensions } from './types.ts'

const DEFAULT_DIMENSIONS: PrintDimensions = {
  widthInches: 8.5,
  heightInches: 11,
  bleedInches: 0.125,
  safeMarginInches: 0.25,
  colorMode: 'CMYK',
  resolutionDpi: 300,
}

const COPY: Record<CosLocale, { subject: (asset: string) => string; body: (publisher: string, asset: string) => string }> = {
  en: {
    subject: asset => `Ad submission package: ${asset}`,
    body: (publisher, asset) => `Hello ${publisher} ad desk,\n\nPlease review the attached print-ready ad package for ${asset}. The package includes layout metadata, dimensions, bleed, margins, and the approved creative asset.\n\nThis message is prepared by SignalBoost and requires owner approval before sending.`,
  },
  es: {
    subject: asset => `Paquete de anuncio: ${asset}`,
    body: (publisher, asset) => `Hola equipo de anuncios de ${publisher},\n\nPor favor revisen el paquete de anuncio listo para impresión de ${asset}. El paquete incluye metadatos de diseño, dimensiones, sangrado, márgenes y el asset creativo aprobado.\n\nEste mensaje fue preparado por SignalBoost y requiere aprobación del propietario antes de enviarse.`,
  },
  'pt-BR': {
    subject: asset => `Pacote de anúncio: ${asset}`,
    body: (publisher, asset) => `Olá equipe de anúncios de ${publisher},\n\nPor favor revisem o pacote de anúncio pronto para impressão de ${asset}. O pacote inclui metadados de layout, dimensões, sangria, margens e o asset criativo aprovado.\n\nEsta mensagem foi preparada pelo SignalBoost e requer aprovação do proprietário antes do envio.`,
  },
  pl: {
    subject: asset => `Pakiet reklamy: ${asset}`,
    body: (publisher, asset) => `Dzień dobry, dział reklam ${publisher},\n\nProsimy o sprawdzenie pakietu reklamy gotowej do druku dla ${asset}. Pakiet zawiera metadane układu, wymiary, spad, marginesy i zatwierdzony materiał kreatywny.\n\nTa wiadomość została przygotowana przez SignalBoost i wymaga zatwierdzenia właściciela przed wysłaniem.`,
  },
  ru: {
    subject: asset => `Пакет объявления: ${asset}`,
    body: (publisher, asset) => `Здравствуйте, рекламный отдел ${publisher},\n\nПожалуйста, проверьте пакет объявления, готового к печати, для ${asset}. Пакет включает метаданные макета, размеры, bleed, поля и утверждённый креативный файл.\n\nЭто сообщение подготовлено SignalBoost и требует утверждения владельца перед отправкой.`,
  },
  de: {
    subject: asset => `Anzeigen-Einreichungspaket: ${asset}`,
    body: (publisher, asset) => `Hallo Anzeigenabteilung von ${publisher},

bitte prüfen Sie das beigefügte druckfertige Anzeigenpaket für ${asset}. Das Paket enthält Layout-Metadaten, Abmessungen, Beschnitt, Ränder und das freigegebene Creative-Asset.

Diese Nachricht wurde von SignalBoost erstellt und erfordert vor dem Versand die Freigabe des Inhabers.`,
  },
  fr: {
    subject: asset => `Dossier de soumission d’annonce : ${asset}`,
    body: (publisher, asset) => `Bonjour au service publicité de ${publisher},

Veuillez examiner le dossier d’annonce prêt à imprimer ci-joint pour ${asset}. Il comprend les métadonnées de mise en page, les dimensions, le fond perdu, les marges et l’élément créatif approuvé.

Ce message a été préparé par SignalBoost et doit être approuvé par le propriétaire avant envoi.`,
  },
  it: {
    subject: asset => `Pacchetto di invio annuncio: ${asset}`,
    body: (publisher, asset) => `Gentile ufficio pubblicità di ${publisher},

vi preghiamo di esaminare il pacchetto pubblicitario pronto per la stampa allegato per ${asset}. Il pacchetto include metadati di impaginazione, dimensioni, abbondanza, margini e l’asset creativo approvato.

Questo messaggio è stato preparato da SignalBoost e richiede l’approvazione del titolare prima dell’invio.`,
  },
  ja: {
    subject: asset => `広告入稿パッケージ：${asset}`,
    body: (publisher, asset) => `${publisher} 広告ご担当者様

添付の${asset}向け入稿用広告パッケージをご確認ください。パッケージには、レイアウトのメタデータ、寸法、塗り足し、余白、承認済みのクリエイティブ素材が含まれています。

このメッセージはSignalBoostが作成したもので、送信前にオーナーの承認が必要です。`,
  },
  ko: {
    subject: asset => `광고 제출 패키지: ${asset}`,
    body: (publisher, asset) => `${publisher} 광고 담당자님께,

첨부된 ${asset}의 인쇄용 광고 패키지를 검토해 주시기 바랍니다. 패키지에는 레이아웃 메타데이터, 치수, 도련, 여백, 승인된 크리에이티브 에셋이 포함되어 있습니다.

이 메시지는 SignalBoost가 작성했으며 발송 전에 소유자의 승인이 필요합니다.`,
  },
  ar: {
    subject: asset => `حزمة تقديم الإعلان: ${asset}`,
    body: (publisher, asset) => `مرحبًا فريق الإعلانات في ${publisher}،

يُرجى مراجعة حزمة الإعلان المرفقة الجاهزة للطباعة الخاصة بـ ${asset}. تتضمن الحزمة بيانات التخطيط الوصفية والأبعاد وهامش القص والهوامش والمادة الإبداعية المعتمدة.

أعدّ SignalBoost هذه الرسالة، وهي تتطلب موافقة المالك قبل إرسالها.`,
  },
}

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru' || locale === 'de' || locale === 'fr' || locale === 'it' || locale === 'ja' || locale === 'ko' || locale === 'ar') return locale
  return 'en'
}

export class PrintDeskPayloadMapper {
  compile(params: {
    locale?: string
    campaignId?: string
    asset: PrintAssetMetadata
    publisher: PrintDeskContact
    dimensions?: Partial<PrintDimensions>
    status?: PrintDeskPayload['status']
  }): PrintDeskPayload {
    const locale = normalizeLocale(params.locale)
    const dimensions = { ...DEFAULT_DIMENSIONS, ...(params.dimensions || {}) }
    const copy = COPY[locale]
    const subject = copy.subject(params.asset.assetTitle)
    const body = copy.body(params.publisher.publisherName, params.asset.assetTitle)

    return {
      id: crypto.randomUUID(),
      status: params.status || 'ready_for_owner_approval',
      locale,
      campaignId: params.campaignId,
      asset: params.asset,
      dimensions,
      publisher: params.publisher,
      subject,
      body,
      attachmentRequired: true,
      dispatchFallback: {
        mode: 'email_fallback',
        to: params.publisher.deskEmail,
        attachFileUrl: params.asset.fileUrl,
        humanApprovalRequired: true,
      },
      createdAt: new Date().toISOString(),
    }
  }
}

export const printDeskPayloadMapper = new PrintDeskPayloadMapper()
