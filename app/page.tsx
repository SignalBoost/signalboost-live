"use client";

import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function HomePage() {
  const { lang, setLang } = useI18n();
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <header className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-bold text-[#FFD700]">
          SignalBoost
        </h1>

        <LanguageSwitcher current={lang} onChange={setLang} />
      </header>

      <section className="max-w-3xl">
        <p className="text-sm text-[#FFD700] mb-3">
          Current language: {lang.toUpperCase()}
        </p>

        <h2 className="text-4xl font-bold mb-4">
          {t("dashboard.title")}
        </h2>

        <p className="text-neutral-400 text-lg mb-8">
          {t("dashboard.subtitle")}
        </p>

        <div className="flex gap-4">
          <button className="px-5 py-3 rounded-lg bg-[#FFD700] text-black font-semibold">
            {t("projects.create")}
          </button>

          <button className="px-5 py-3 rounded-lg border border-neutral-700 text-white">
            {t("editor.preview")}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="font-semibold mb-2">{t("projects.title")}</h3>
          <p className="text-sm text-neutral-400">{t("projects.empty")}</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="font-semibold mb-2">{t("billing.title")}</h3>
          <p className="text-sm text-neutral-400">{t("billing.current")}</p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
          <h3 className="font-semibold mb-2">{t("nav.automations")}</h3>
          <p className="text-sm text-neutral-400">{t("common.loading")}</p>
        </div>
      </section>
    </main>
  );
}
