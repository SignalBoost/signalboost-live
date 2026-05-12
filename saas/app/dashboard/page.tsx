"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");

  async function generateAI(customPrompt?: string) {
    const finalPrompt = customPrompt || prompt;

    if (!finalPrompt.trim()) {
      setResult("Please describe what you want to build.");
      return;
    }

    setLoading(true);
    setResult("");
    setLastPrompt(finalPrompt);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: finalPrompt,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.result);
      } else {
        setResult(data.error || "AI generation failed.");
      }
    } catch {
      setResult("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setPrompt("");
    setResult("");
    setLastPrompt("");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05070b",
        color: "white",
        padding: "40px",
      }}
    >
      <h1
        style={{
          color: "#FFD700",
          fontSize: "56px",
          marginBottom: "30px",
        }}
      >
        SignalBoost AI
      </h1>

      <section
        style={{
          background: "#111722",
          padding: "28px",
          borderRadius: "20px",
          marginBottom: "28px",
        }}
      >
        <h2 style={{ marginBottom: "16px" }}>
          What do you want to build?
        </h2>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Example: Build an AI SaaS for restaurant marketing..."
          style={{
            width: "100%",
            minHeight: "150px",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #333",
            background: "#0b111a",
            color: "white",
            marginBottom: "18px",
            fontSize: "16px",
          }}
        />

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={() => generateAI()}
            disabled={loading}
            style={button}
          >
            {loading ? "Generating..." : "Generate AI Strategy"}
          </button>

          <button
            onClick={() => generateAI(lastPrompt)}
            disabled={loading || !lastPrompt}
            style={secondaryButton}
          >
            Refresh / Generate Again
          </button>

          <button onClick={clearAll} disabled={loading} style={secondaryButton}>
            Clear
          </button>
        </div>
      </section>

      {loading && (
        <section style={resultBox}>
          Generating your AI strategy...
        </section>
      )}

      {result && !loading && (
        <section style={resultBox}>
          <h2 style={{ color: "#FFD700", marginBottom: "16px" }}>
            AI Response
          </h2>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {result}
          </div>
        </section>
      )}
    </main>
  );
}

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

const resultBox = {
  background: "#111722",
  padding: "28px",
  borderRadius: "20px",
};
