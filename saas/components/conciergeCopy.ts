import { uiText } from '@/lib/i18n/uiText'
export const conciergeCopy = {
  en: {
    label: uiText('generatedUi.u_ad74fd828a4b258a'),
    title: uiText('generatedUi.u_ad74fd828a4b258a'),
    default: uiText('generatedUi.u_7a5580627692ea75'),
    thinking: uiText('generatedUi.u_b4739a4f08650db2'),
    videosBtn: uiText('generatedUi.u_88005532d4ace6bf'),
    creditsBtn: uiText('generatedUi.u_f0de13091ddcb354'),
    growthBtn: uiText('generatedUi.u_5b7024313fda2781'),
    supportBtn: uiText('generatedUi.u_1d5fbdb3d68c99e8'),
  },
}

export function getConciergeCopy(lang: string) {
  return conciergeCopy.en
}
