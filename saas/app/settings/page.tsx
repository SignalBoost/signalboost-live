// saas/app/settings/page.tsx

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email ?? "");
        setName(user.user_metadata?.name ?? "");
      }
    };
    load();
  }, []);

  const updateProfile = async () => {
    await supabase.auth.updateUser({
      data: { name },
    });
    alert("Profile updated!");
  };

  const sendPasswordReset = async () => {
    await supabase.auth.resetPasswordForEmail(email);
    alert("Password reset email sent.");
  };

  return (
    <div style={wrapper}>
      <h1 style={title}>Settings</h1>

      {/* Profile */}
      <div style={card}>
        <h2 style={sectionTitle}>Profile</h2>

        <label style={label}>Name</label>
        <input
          style={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />

        <label style={label}>Email</label>
        <input style={input} value={email} disabled />

        <button style={button} onClick={updateProfile}>
          Save Changes
        </button>
      </div>

      {/* Password Reset */}
      <div style={card}>
        <h2 style={sectionTitle}>Password</h2>
        <button style={button} onClick={sendPasswordReset}>
          Send Password Reset Email
        </button>
      </div>

      {/* Theme */}
      <div style={card}>
        <h2 style={sectionTitle}>Theme</h2>
        <p style={text}>Dark mode is currently enabled by default.</p>
      </div>

      {/* Danger Zone */}
      <div style={dangerCard}>
        <h2 style={dangerTitle}>Danger Zone</h2>
        <button style={dangerButton}>
          Delete Account
        </button>
      </div>
    </div>
  );
}

/* Styles */

const wrapper = {
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  padding: "20px",
};

const title = {
  fontSize: "28px",
  fontWeight: "bold",
  color: "#FFD700",
};

const card = {
  background: "#0f141c",
  padding: "20px",
  borderRadius: "12px",
  border: "1px solid #222",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const dangerCard = {
  ...card,
  border: "1px solid #ff4444",
};

const sectionTitle = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#fff",
};

const dangerTitle = {
  ...sectionTitle,
  color: "#ff4444",
};

const label = {
  fontSize: "14px",
  color: "#ccc",
};

const input = {
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid #333",
  background: "#1a1f29",
  color: "white",
};

const button = {
  marginTop: "10px",
  padding: "12px",
  background: "#FFD700",
  color: "#000",
  borderRadius: "8px",
  border: "none",
  fontWeight: "bold",
  cursor: "pointer",
};

const dangerButton = {
  ...button,
  background: "#ff4444",
  color: "#fff",
};

const text = {
  color: "#aaa",
};
