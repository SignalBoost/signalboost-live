"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Generation = {
  id: string;
  prompt: string;
  result: string;
  created_at: string;
};

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("strategy");
  const [language, setLanguage] = useState("en");
  const [result, setResult] = useState("");
  const [history, setHistory] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setHistory(data);
    }
  }

  async function generateAI() {
    if (!prompt.trim()) {
      setResult("Please describe what you want to create.");
      return;
    }

    setLoading(true);
    setResult("");
    setAudioUrl("");
    setVideoUrl("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setResult("You must be logged in.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          mode,
          language,
          user_id: user.id,
        }),
      });

      const data = await res.json();

      if (data.result) {
        setResult(data.result);

        if (data.video_url) {
          setVideoUrl(data.video_url);
        }

        setPrompt("");
        await loadHistory();
      } else {
        setResult(data.error || "Something went wrong.");
      }
    } catch (error) {
      console.error(error);
      setResult("Something went wrong.");
    }

    setLoading(false);
  }

  async function playVoice(text: string) {
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          language,
        }),
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshHistory() {
    await loadHistory();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const modes = [
    "strategy",
    "voice",
    "video",
    "podcast",
    "social",
    "visual",
    "translate",
  ];

  const languages = [
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "pt", label: "Portuguese" },
    { code: "pl", label: "Polish" },
    { code: "ru", label: "Russian" },
  ];

  return (
    <main style={main}>
      <header style={header}>
        <div>
          <h1 style={title}>SignalBoost AI</h1>

          <p style={{ color: "#999" }}>
            Multilingual AI generation platform.
          </p>
        </div>

        <button onClick={logout} style={secondaryButton}>
          Logout
        </button>
      </header>

      <section style={card}>
        <h2 style={{ marginBottom: "16px" }}>
          What do you want to create?
        </h2>

        {/* LANGUAGE SELECT */}

        <div style={{ marginBottom: "24px" }}>
          <label style={label}>
            🌍 Language
          </label>

          <div style={selectWrapper}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={languageSelect}
            >
              {languages.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                >
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* MODE BUTTONS */}

        <div style={modeGrid}>
          {modes.map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              style={{
                padding: "14px",
                borderRadius: "12px",
                border:
                  mode === item
                    ? "2px solid #FFD700"
                    : "1px solid #333",
                background:
                  mode === item
                    ? "#FFD700"
                    : "#0b111a",
                color:
                  mode === item
                    ? "#000"
                    : "#fff",
                cursor: "pointer",
                fontWeight: "bold",
                textTransform: "capitalize",
              }}
            >
              {item}
            </button>
          ))}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to create..."
          style={textarea}
        />

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={generateAI}
            disabled={loading}
            style={button}
          >
            {loading ? "Generating..." : "Generate"}
          </button>

          <button
            onClick={refreshHistory}
            disabled={loading}
            style={secondaryButton}
          >
            Refresh
          </button>
        </div>
      </section>

      {result && (
        <section style={card}>
          <h2
            style={{
              color: "#FFD700",
              marginBottom: "16px",
            }}
          >
            AI Response
          </h2>

          <div style={responseText}>
            {result}
          </div>

          {videoUrl && (
            <video
              src={videoUrl}
              controls
              autoPlay
              style={video}
            />
          )}

          <button
            onClick={() => playVoice(result)}
            style={button}
          >
            🔊 Play Voice
          </button>

          {audioUrl && (
            <audio
              src={audioUrl}
              controls
              autoPlay
              style={{
                marginTop: "20px",
                width: "100%",
              }}
            />
          )}
        </section>
      )}

      <section style={card}>
        <h2 style={{ marginBottom: "20px" }}>
          Saved AI History
        </h2>

        {history.length === 0 ? (
          <p style={{ color: "#999" }}>
            No saved AI responses yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "18px" }}>
            {history.map((item) => (
              <div
                key={item.id}
                style={historyCard}
              >
                <p style={historyPrompt}>
                  {item.prompt}
                </p>

                <p style={historyResult}>
                  {item.result}
                </p>

                <button
                  onClick={() =>
                    playVoice(item.result)
                  }
                  style={secondaryButton}
                >
                  🔊 Play Voice
                </button>

                <div style={historyDate}>
                  {new Date(
                    item.created_at
                  ).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const main = {
  minHeight: "100vh",
  background: "#05070b",
  color: "white",
  padding: "40px",
  fontFamily: "Arial, sans-serif",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "36px",
  gap: "20px",
  flexWrap: "wrap" as const,
};

const title = {
  color: "#FFD700",
  fontSize: "48px",
  marginBottom: "8px",
};

const card = {
  background: "#111722",
  padding: "28px",
  borderRadius: "20px",
  marginBottom: "28px",
};

const label = {
  marginBottom: "10px",
  display: "block",
  fontWeight: "bold",
};

const selectWrapper = {
  width: "280px",
  maxWidth: "100%",
};

const languageSelect = {
  width: "100%",
  padding: "14px",
  borderRadius: "12px",
  border: "1px solid #333",
  background: "#0b111a",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "bold",
  cursor: "pointer",
  outline: "none",
};

const modeGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "12px",
  marginBottom: "20px",
};

const textarea = {
  width: "100%",
  minHeight: "150px",
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #333",
  background: "#0b111a",
  color: "white",
  marginBottom: "18px",
  fontSize: "16px",
};

const button = {
  padding: "14px 22px",
  borderRadius: "10px",
  border: 0,
  background: "#FFD700",
  color: "#000",
  fontWeight: "bold",
  cursor: "pointer",
};

const secondaryButton = {
  padding: "14px 22px",
  borderRadius: "10px",
  border: "1px solid #333",
  background: "#0b111a",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const responseText = {
  whiteSpace: "pre-wrap" as const,
  lineHeight: 1.7,
  marginBottom: "20px",
};

const video = {
  width: "100%",
  borderRadius: "12px",
  marginBottom: "20px",
  background: "#000",
};

const historyCard = {
  background: "#0b111a",
  padding: "20px",
  borderRadius: "14px",
  border: "1px solid #222",
};

const historyPrompt = {
  color: "#FFD700",
  fontWeight: "bold",
  marginBottom: "10px",
};

const historyResult = {
  color: "#aaa",
  whiteSpace: "pre-wrap" as const,
  lineHeight: 1.6,
  marginBottom: "14px",
};

const historyDate = {
  marginTop: "12px",
  color: "#777",
  fontSize: "12px",
};
