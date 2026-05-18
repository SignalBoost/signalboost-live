"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "@/components/i18n/useTranslation";
import { useTTS } from "@/hooks/useTTS";
import { CURATED_VOICES, type VoiceLocale } from "@/lib/elevenlabs/voices";

const MAX_CHARS = 5000;
const GOLD = "#ffc300";
const BLUE = "#3b82f6";

const LOCALE_LABELS: Record<string, { flag: string; label: string }> = {
  "all": { flag: "ALL", label: "All languages" },
  "en": { flag: "EN", label: "English" },
  "pt-BR": { flag: "BR", label: "Portugues (BR)" },
  "pt-PT": { flag: "PT", label: "Portugues (PT)" },
  "es-LATAM": { flag: "MX", label: "Espanol (LATAM)" },
  "es-ES": { flag: "ES", label: "Espanol (ES)" },
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
