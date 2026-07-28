"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "@/components/i18n/useTranslation";
import { useTTS } from "@/hooks/useTTS";
import { CURATED_VOICES, type VoiceLocale } from "@/lib/elevenlabs/voices";
import ResetButton from "@/components/ResetButton";
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


const MAX_CHARS = 5000;
const GOLD = "#ffc300";
const BLUE = "#3b82f6";

const LOCALE_LABELS: Record<string, { flag: string; label: string }> = {
  "all": { flag: uiCopy('u_1cb74e7c5e6a5f55'), label: uiCopy('u_20e4602d2af4ba0a') },
  "en": { flag: "EN", label: uiCopy('u_5a068871ef8fc7f8') },
  "pt-BR": { flag: uiCopy('u_b9dc5449a70ac04c'), label: uiCopy('u_8373ad9f3cda1999') },
  "pt-PT": { flag: "PT", label: uiCopy('u_ed6b7b469e107a54') },
  "es-LATAM": { flag: uiCopy('u_539c78be90021d58'), label: uiCopy('u_23ac841473f42557') },
  "es-ES": { flag: "ES", label: uiCopy('u_b72f25cc78c0e014') },
  "pl": { flag: "PL", label: "Polski" },
  "ru": { flag: "RU", label: "Russkiy" },
};

const LOCALE_ORDER = ["all", "en", "pt-BR", "pt-PT", "es-LATAM", "es-ES", "pl", "ru"];

interface Props {
  initialLocale?: VoiceLocale | "all";
}

export function TTSPlayer({ initialLocale = "en" }: Props) {
  const { t } = useTranslation();
  const { generate, loading, error, result, reset } = useTTS();

  const [text, setText] = useState("");
  const [localeFilter, setLocaleFilter] = useState<string>(initialLocale);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleVoices = useMemo(() => {
    if (localeFilter === "all") return CURATED_VOICES;
    return CURATED_VOICES.filter((v) => v.locale === localeFilter);
  }, [localeFilter]);

  useEffect(() => {
    if (!visibleVoices.some((v) => v.id === selectedVoiceId)) {
      setSelectedVoiceId(visibleVoices[0]?.id ?? "");
    }
  }, [visibleVoices, selectedVoiceId]);

  // Auto-scroll to result card when generated
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [result]);

  const selectedVoice = useMemo(
    () => CURATED_VOICES.find((v) => v.id === selectedVoiceId),
    [selectedVoiceId]
  );

  const overLimit = text.length > MAX_CHARS;
  const canSubmit = text.trim().length > 0 && !overLimit && !loading && !!selectedVoiceId;

  const handleGenerate = async () => {
    if (!canSubmit) return;
    await generate(text.trim(), selectedVoiceId);
  };

  const handleClearText = () => {
    setText("");
    reset();
  };

  const handleFullReset = () => {
    setText("");
    setLocaleFilter(initialLocale);
    setLangDropdownOpen(false);
    reset();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDownload = () => {
    if (!result) return;
    const link = document.createElement("a");
    link.href = result.audioUrl;
    link.download = "signalboost-audio.mp3";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentLangLabel = LOCALE_LABELS[localeFilter];

  return (
    <div style={{ color: "#fff", fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            {t("audio.title", uiCopy('u_badb5cee3e9c53c3'))}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {t("audio.subtitle", uiCopy('u_45438b9b186e40e5'))}
          </p>
        </div>

        <div ref={langDropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setLangDropdownOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.7 }}>{currentLangLabel.flag}</span>
            <span>{currentLangLabel.label}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>v</span>
          </button>

          {langDropdownOpen ? (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 8,
                background: "#111118",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: 6,
                minWidth: 220,
                zIndex: 50,
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
              }}
            >
              {LOCALE_ORDER.map((loc) => {
                const opt = LOCALE_LABELS[loc];
                const selected = loc === localeFilter;
                return (
                  <button
                    key={loc}
                    onClick={() => {
                      setLocaleFilter(loc);
                      setLangDropdownOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: selected ? "rgba(59,130,246,0.15)" : "transparent",
                      color: selected ? BLUE : "rgba(255,255,255,0.7)",
                      fontSize: 13,
                      fontWeight: selected ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, minWidth: 28 }}>{opt.flag}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Voice grid */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
            {t("audio.pickVoice", uiCopy('u_8631bd03adfd44ae'))}
          </h2>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {visibleVoices.length} {t("audio.voicesAvailable", uiCopy('u_53d1a62e5146b457'))}
          </span>
        </div>

        {visibleVoices.length === 0 ? (
          <div
            style={{
              padding: 24,
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: 14,
              textAlign: "center",
              color: "rgba(255,255,255,0.4)",
              fontSize: 13,
            }}
          >
            {t("audio.noVoices", uiCopy('u_5a861f41253e570d'))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {visibleVoices.map((v) => {
              const selected = selectedVoiceId === v.id;
              const flag = LOCALE_LABELS[v.locale]?.flag || "";
              const description = t(v.descriptionKey, v.descriptionFallback);
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoiceId(v.id)}
                  style={{
                    padding: "16px",
                    background: selected ? "rgba(59,130,246,0.12)" : "rgba(255,255,255,0.02)",
                    border: "1px solid " + (selected ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.07)"),
                    borderRadius: 14,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, minWidth: 24 }}>{flag}</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{v.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
                    {description}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {v.gender}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Text input with clear button */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}>
            {t("audio.yourText", uiCopy('u_8aeab9ac365e08aa'))}
          </h2>
          {(text.length > 0 || error || result || loading) ? (
            <ResetButton onReset={handleFullReset} className="sb-button-ghost" />
          ) : null}
          {text.length > 0 ? (
            <button
              onClick={handleClearText}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "4px 12px",
                cursor: "pointer",
              }}
            >
              {t("audio.clear", uiCopy('u_e67c262e7180a1db'))}
            </button>
          ) : null}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("audio.textPlaceholder", uiCopy('u_a50baf774ad6304d'))}
          rows={5}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            color: "#fff",
            fontSize: 14,
            lineHeight: 1.6,
            fontFamily: "inherit",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
          <span style={{ color: overLimit ? "#f87171" : "rgba(255,255,255,0.4)" }}>
            {text.length} / {MAX_CHARS} {t("audio.characters", uiCopy('u_d39bc753c121477c'))}
          </span>
          {overLimit ? (
            <span style={{ color: "#f87171", fontWeight: 600 }}>
              {t("audio.overLimit", uiCopy('u_4ad8946bc8e06287'))}
            </span>
          ) : null}
        </div>
      </div>

      {/* RESULT CARD — appears above Generate button when audio is ready */}
      {result ? (
        <div
          ref={resultRef}
          style={{
            background: "rgba(255,195,0,0.06)",
            border: "1px solid rgba(255,195,0,0.3)",
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {result.cached ? t("audio.servedFromCache", uiCopy('u_188496acf9305202')) : t("audio.justGenerated", uiCopy('u_546a4be29489be28'))}
              </div>
              {selectedVoice ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                  {selectedVoice.name}
                </div>
              ) : null}
            </div>
            <button
              onClick={handleDownload}
              style={{
                padding: "8px 18px",
                borderRadius: 999,
                background: "rgba(255,195,0,0.15)",
                color: GOLD,
                fontSize: 12,
                fontWeight: 700,
                border: "1px solid rgba(255,195,0,0.3)",
                cursor: "pointer",
              }}
            >
              {t("audio.download", uiCopy('u_250ed6709c2b9e4f'))}
            </button>
          </div>
          <audio
            controls
            src={result.audioUrl}
            style={{ width: "100%", borderRadius: 8 }}
          />
        </div>
      ) : null}

      {/* ERROR CARD — appears above Generate when present */}
      {error ? (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 14,
            padding: "14px 18px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>
            {t("audio.error", uiCopy('u_1831bec02844b515'))}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {error.message}
          </div>
        </div>
      ) : null}

      {/* Generate button */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
        <button
          onClick={handleGenerate}
          disabled={!canSubmit}
          style={{
            padding: "14px 36px",
            borderRadius: 999,
            background: canSubmit ? GOLD : "rgba(255,255,255,0.06)",
            color: canSubmit ? "#000" : "rgba(255,255,255,0.3)",
            border: "none",
            fontSize: 15,
            fontWeight: 800,
            cursor: canSubmit ? "pointer" : "not-allowed",
            minWidth: 220,
          }}
        >
          {loading
            ? t("audio.generating", uiCopy('u_9cc191a96c836c49'))
            : result
            ? t("audio.generateAgain", uiCopy('u_b0f797ae72a8d7d1'))
            : t("audio.generate", uiCopy('u_17e4ad13278c5381'))}
        </button>
      </div>
    </div>
  );
}
