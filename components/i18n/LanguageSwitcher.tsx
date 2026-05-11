"use client";

type Props = {
  current: string;
  onChange: (lang: string) => void;
};

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "pt", label: "PT" },
  { code: "pl", label: "PL" },
  { code: "ru", label: "RU" }
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
