"use client";
import React from "react";

export default function LoginPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "100px" }}>
      <h2>Welcome to SignalBoost 👋</h2>
      <p>Login or sign up</p>

      <button onClick={() => (window.location.href = "/api/auth/github")}>
        Continue with GitHub
      </button>

      <button onClick={() => (window.location.href = "/api/auth/google")}>
        Continue with Google
      </button>

      <button onClick={() => (window.location.href = "/api/auth/facebook")}>
        Continue with Facebook
      </button>

      <button onClick={() => (window.location.href = "/api/auth/azure")}>
        Continue with SSO
      </button>

      <p style={{ marginTop: "20px", fontSize: "12px", color: "#666" }}>
        By clicking continue, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
