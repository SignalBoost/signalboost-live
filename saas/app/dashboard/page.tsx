"use client";

import { useState } from "react";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    try {
      setLoading(true);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.result);
      } else {
        setResult(data.error);
      }
    } catch (error) {
      console.error(error);
      setResult("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000814",
        color: "white",
        padding: "40px",
      }}
    >
      <h1
        style={{
          color: "#FFD700",
          fontSize: "64px",
          fontWeight: "bold",
          marginBottom: "40px",
        }}
      >
        SignalBoost AI
      </h1>

      <div
        style={{
          background: "#071126",
          padding: "24px",
          borderRadius: "16px",
          marginBottom: "24px",
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your startup idea..."
          style={{
            width: "100%",
            height: "140px",
            background: "#000814",
            color: "white",
            border: "1px solid #333",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
          }}
        />

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            background: "#FFD700",
            color: "black",
            padding: "14px 24px",
            borderRadius: "8px",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          {loading ? "Generating..." : "Generate AI Strategy"}
        </button>
      </div>

      {result && (
        <div
          style={{
            background: "#071126",
            padding: "24px",
            borderRadius: "16px",
            whiteSpace: "pre-wrap",
            lineHeight: "1.7",
          }}
        >
          {result}
        </div>
      )}
    </main>
  );
}
