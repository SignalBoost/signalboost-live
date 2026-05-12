"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (data.success) {
      router.push(data.redirect);
    } else {
      setError(data.error || "Login failed");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05070b",
        color: "white",
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#111722",
          padding: "32px",
          borderRadius: "20px",
        }}
      >
        <h1
          style={{
            color: "#FFD700",
            marginBottom: "24px",
          }}
        >
          Login
        </h1>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={input}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          style={input}
        />

        <button type="submit" style={button}>
          Login
        </button>

        {error && (
          <p style={{ color: "red", marginTop: "16px" }}>
            {error}
          </p>
        )}

        <p style={{ marginTop: "20px", color: "#999" }}>
          No account? <a href="/signup">Create one</a>
        </p>
      </form>
    </main>
  );
}

const input = {
  width: "100%",
  padding: "14px",
  marginBottom: "14px",
  borderRadius: "10px",
  border: "1px solid #333",
  background: "#0b111a",
  color: "white",
};

const button = {
  width: "100%",
  padding: "14px",
  borderRadius: "10px",
  border: 0,
  background: "#FFD700",
  color: "#000",
  fontWeight: "bold",
  cursor: "pointer",
};
