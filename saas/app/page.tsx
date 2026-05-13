"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function DashboardPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("strategy");
  const [language, setLanguage] = useState("en");
  const [result, setResult] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const modes = [
    { id: "strategy", label: "Strategy" },
    { id: "voice", label: "Voice" },
    { id: "video", label: "Video" },
    { id: "podcast", label: "Podcast" },
    { id: "social", label: "Social" },
    { id: "visual", label: "Visual" },
    { id: "translate", label: "Translate" },
  ];

  const languages = [
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "pt", label: "Portuguese" },
    { code: "pl", label: "Polish" },
    { code: "ru", label: "Russian" },
  ];

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("generations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) setHistory(data);
  }

  async function generateAI() {
    setLoading(true);
    setResult("");
    setAudioUrl("");
    setVideoUrl("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setResult("You must be logged in.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode, language }),
    });

    const data = await res.json();

    if (data.result) {
      setResult(data.result);
      setPrompt("");
      loadHistory();
    } else {
      setResult(data.error || "Something went wrong.");
    }

    setLoading(false);
  }

  return (
    <div className="dashboard">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h1 className="logo">SignalBoost</h1>
        <nav>
          <button className="nav-item active">Dashboard</button>
          <button className="nav-item">History</button>
          <button className="nav-item">Settings</button>
        </nav>
        <button
          className="logout"
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/";
          }}
        >
          Logout
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="content">
        <header className="topbar">
          <select
            className="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </header>

        <section className="workspace">
          <div className="mode-selector">
            {modes.map((m) => (
              <button
                key={m.id}
                className={`mode-btn ${mode === m.id ? "active" : ""}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <textarea
            className="prompt-box"
            placeholder="Describe what you want to create..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <button className="generate-btn" onClick={generateAI} disabled={loading}>
            {loading ? "Generating..." : "Generate"}
          </button>

          {result && (
            <div className="response-card">
              <h2>AI Response</h2>
              <p>{result}</p>
            </div>
          )}
        </section>

        <section className="history">
          <h2>History</h2>
          {history.length === 0 ? (
            <p>No history yet.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="history-item">
                <strong>{item.prompt}</strong>
                <p>{item.result}</p>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
