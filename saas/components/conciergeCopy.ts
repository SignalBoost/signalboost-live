import { uiCopy } from '@/lib/i18n/generatedUiCopy'
export const conciergeCopy = {
  en: {
    label: uiCopy('u_76309d44b52bc496'),
    title: uiCopy('u_8d6836cbbba2cafe'),
    default: uiCopy('u_b7ff7e3a98f5301e'),
    thinking: uiCopy('u_63246de5ab15b633'),
    videosBtn: uiCopy('u_1fee4a28506c8c44'),
    creditsBtn: uiCopy('u_4d629c8a0df9a388'),
    growthBtn: uiCopy('u_979dab3e66335ab4'),
    supportBtn: uiCopy('u_bf098b9e1b8d93fc'),
  },
}

export function getConciergeCopy(lang: string) {
  return conciergeCopy.en
}
