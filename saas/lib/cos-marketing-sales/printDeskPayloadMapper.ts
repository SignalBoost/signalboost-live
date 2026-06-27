// saas/lib/cos-marketing-sales/printDeskPayloadMapper.ts
// Traditional print desk payload mapper.
// Local papers and magazines often use email-based ad desks instead of APIs;
// this class compiles a unified submission payload for owner approval.

import type { CosLocale, PrintAssetMetadata, PrintDeskContact, PrintDeskPayload, PrintDimensions } from './types'

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
}

function normalizeLocale(locale?: string): CosLocale {
  if (locale === 'es' || locale === 'pt-BR' || locale === 'pl' || locale === 'ru') return locale
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
