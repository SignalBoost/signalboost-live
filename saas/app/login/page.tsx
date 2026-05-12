"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin() {
    alert("LOGIN BUTTON WORKS");

    try {
      setMessage("Logging in...");

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      console.log("LOGIN RESPONSE:", data);
      console.log("LOGIN ERROR:", error);

      if (error) {
        setMessage(error.message);
        alert(error.message);
        return;
      }

      if (!data.session) {
        setMessage("No session created.");
        alert("No session created.");
        return;
      }

      setMessage("SUCCESS");

      alert("LOGIN SUCCESS");

      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);

      alert("LOGIN CRASHED");

      setMessage("Something crashed.");
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
      <div
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
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          style={input}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          style={input}
        />

        <button
          onClick={handleLogin}
          style={button}
        >
          Login
        </button>

        <p
          style={{
            marginTop: "20px",
            color: "#FFD700",
          }}
        >
          {message}
        </p>

        <p
          style={{
            marginTop: "20px",
            color: "#999",
          }}
        >
          No account?{" "}
          <a href="/signup">
            Create one
          </a>
        </p>
      </div>
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
