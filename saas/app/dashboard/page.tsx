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

    const { data } = await supabase
      .from("generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setHistory(data || []);
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
        setPrompt("");
        await loadHistory();

        if (mode === "video") {
          await generateVideo();
        }
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

  async function generateVideo() {
    try {
      const res = await fetch("/api/video", {
        method: "POST",
      });

      const data = await res.json();

      if (data.videoUrl) {
        setVideoUrl(data.videoUrl);
      }
    } catch (error) {
      console.error(error);
    }
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
    { code: "es", label: "Español" },
    { code: "pt", label: "Português" },
    { code: "pl", label: "Polski" },
    { code: "ru", label: "Русский" },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05070b",
        color: "white",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "36px",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              color: "#FFD700",
              fontSize: "48px",
              marginBottom: "8px",
            }}
          >
            SignalBoost AI
          </h1>

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

        <label style={{ marginBottom: "8px", display: "block" }}>
          🌍 Language
        </label>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={select}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "12px",
            marginBottom: "20px",
            marginTop: "20px",
          }}
        >
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
                background: mode === item ? "#FFD700" : "#0b111a",
                color: mode === item ? "#000" : "#fff",
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

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button onClick={generateAI} disabled={loading} style={button}>
            {loading ? "Generating..." : "Generate"}
          </button>

          <button onClick={loadHistory} disabled={loading} style={secondaryButton}>
            Refresh
          </button>
        </div>
      </section>

      {result && (
        <section style={card}>
          <h2 style={{ color: "#FFD700", marginBottom: "16px" }}>
            AI Response
          </h2>

          <div
            style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              marginBottom: "20px",
            }}
          >
            {result}
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={() => playVoice(result)} style={button}>
              🔊 Play Voice
            </button>

            {mode === "video" && (
              <button onClick={generateVideo} style={button}>
                🎬 Generate Video Preview
              </button>
            )}
          </div>

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

          {videoUrl && (
            <video
              src={videoUrl}
              controls
              autoPlay
              style={{
                marginTop: "20px",
                width: "100%",
                borderRadius: "14px",
              }}
            />
          )}
        </section>
      )}

      <section style={card}>
        <h2 style={{ marginBottom: "20px" }}>Saved AI History</h2>

        {history.length === 0 ? (
          <p style={{ color: "#999" }}>No saved AI responses yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "18px" }}>
            {history.map((item) => (
              <div key={item.id} style={historyCard}>
                <p
                  style={{
                    color: "#FFD700",
                    fontWeight: "bold",
                    marginBottom: "10px",
                  }}
                >
                  {item.prompt}
                </p>

                <p
                  style={{
                    color: "#aaa",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                    marginBottom: "14px",
                  }}
                >
                  {item.result}
                </p>

                <button
                  onClick={() => playVoice(item.result)}
                  style={secondaryButton}
                >
                  🔊 Play Voice
                </button>

                <div
                  style={{
                    marginTop: "12px",
                    color: "#777",
                    fontSize: "12px",
                  }}
                >
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const card = {
  background: "#111722",
  padding: "28px",
  borderRadius: "20px",
  marginBottom: "28px",
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

const select = {
  width: "100%",
  padding: "14px",
  borderRadius: "10px",
  border: "1px solid #333",
  background: "#0b111a",
  color: "white",
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

const historyCard = {
  background: "#0b111a",
  padding: "20px",
  borderRadius: "14px",
  border: "1px solid #222",
};
