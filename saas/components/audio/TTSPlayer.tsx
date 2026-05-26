"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "@/components/i18n/useTranslation";
import { useTTS } from "@/hooks/useTTS";
import { CURATED_VOICES, type VoiceLocale } from "@/lib/elevenlabs/voices";

const MAX_CHARS = 5000;
const GOLD = "#ffc300";
const BLUE = "#3b82f6";

const LOCALE_LABELS: Record<string, { flag: string; label: string; labelPt?: string }> = {
  "all": { flag: "ALL", label: "All languages", labelPt: "Todos os idiomas" },
  "en": { flag: "EN", label: "English", labelPt: "Inglês" },
  "pt-BR": { flag: "BR", label: "Português (BR)", labelPt: "Português (BR)" },
  "pt-PT": { flag: "PT", label: "Português (PT)", labelPt: "Português (PT)" },
  "es-LATAM": { flag: "MX", label: "Español (LATAM)", labelPt: "Espanhol (LATAM)" },
  "es-ES": { flag: "ES", label: "Español (ES)", labelPt: "Espanhol (ES)" },
  "pl": { flag: "PL", label: "Polski" },
  "ru": { flag: "RU", label: "Russkiy", labelPt: "Russo" },
};

const LOCALE_ORDER = ["all", "en", "pt-BR", "pt-PT", "es-LATAM", "es-ES", "pl", "ru"];

interface Props {
  initialLocale?: VoiceLocale | "all";
}

export function TTSPlayer({ initialLocale = "en" }: Props) {
  const { t, lang } = useTranslation();
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
            {t("audio.title", "Audio")}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {t("audio.subtitle", "Turn any text into native-sounding audio.")}
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
            <span>{lang === "pt" ? (currentLangLabel.labelPt ?? currentLangLabel.label) : currentLangLabel.label}</span>
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
                    <span>{lang === "pt" ? (opt.labelPt ?? opt.label) : opt.label}</span>
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
            {t("audio.pickVoice", "Pick a voice")}
          </h2>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {visibleVoices.length} {t("audio.voicesAvailable", "available")}
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
            {t("audio.noVoices", "No voices available for this language.")}
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
                    {v.gender === "female" ? t("audio.genderFemale", "Feminino") : t("audio.genderMale", "Masculino")}
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
            {t("audio.yourText", "Your text")}
          </h2>
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
              {t("audio.clear", "Clear")}
            </button>
          ) : null}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("audio.textPlaceholder", "Type or paste what you want to say...")}
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
            {text.length} / {MAX_CHARS} {t("audio.characters", "characters")}
          </span>
          {overLimit ? (
            <span style={{ color: "#f87171", fontWeight: 600 }}>
              {t("audio.overLimit", "Over the character limit")}
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
                {result.cached ? t("audio.servedFromCache", "Served from cache") : t("audio.justGenerated", "Just generated")}
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
              {t("audio.download", "Download")}
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
            {t("audio.error", "Generation failed")}
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
            ? t("audio.generating", "Generating...")
            : result
            ? t("audio.generateAgain", "Generate again")
            : t("audio.generate", "Generate audio")}
        </button>
      </div>
    </div>
  );
}
