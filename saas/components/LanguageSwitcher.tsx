"use client";
import { uiText } from '@/lib/i18n/uiText'


type Props = {
  current: string;
  onChange: (lang: string) => void;
};

const LANGUAGES = [
  { code: "en", label: uiText('generatedUi.u_69374b09b1681162') },
  { code: "es", label: uiText('generatedUi.u_ce344a418127968f') },
  { code: "pt", label: uiText('generatedUi.u_169b032adf2ab80f') },
  { code: "pl", label: uiText('generatedUi.u_293650de072648b9') },
  { code: "ru", label: uiText('generatedUi.u_f37e3358243de943') }
];

export default function LanguageSwitcher({
  current,
  onChange
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => onChange(lang.code)}
          className={[
            "px-2 py-1 rounded text-xs border transition-colors",
            current === lang.code
              ? "bg-[#FFD700] text-black border-[#FFD700]"
              : "bg-transparent text-white border-neutral-700 hover:border-[#FFD700]"
          ].join(" ")}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
