"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthModal() {
  const router = useRouter();

  const [tab, setTab] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/dashboard");
  };

  const handleSignup = async () => {
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Signup successful. Check your email to confirm.");
  };

  const handleReset = async () => {
    setMessage("");

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth`,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password reset email sent.");
  };

  const handleOAuth = async (provider: "google" | "github") => {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${siteUrl}/dashboard`,
      },
    });

    if (error) setMessage(error.message);
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111722]/90 p-8 shadow-2xl">
      <div className="mb-6 text-center">
        <p className="text-sm font-bold text-yellow-400">SignalBoost</p>
        <h1 className="mt-2 text-3xl font-black text-white">
          {tab === "login"
            ? "Welcome back"
            : tab === "signup"
            ? "Create account"
            : "Reset password"}
        </h1>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-full bg-gray-950 p-1">
        {(["login", "signup", "reset"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`rounded-full py-2 text-xs font-bold capitalize ${
              tab === item
                ? "bg-yellow-400 text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab !== "reset" && (
        <div className="mb-5 grid gap-3">
          <button
            onClick={() => handleOAuth("google")}
            className="rounded-full bg-white px-4 py-3 font-bold text-black"
          >
            Continue with Google
          </button>

          <button
            onClick={() => handleOAuth("github")}
            className="rounded-full bg-gray-800 px-4 py-3 font-bold text-white"
          >
            Continue with GitHub
          </button>
        </div>
      )}

      <div className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          className="w-full rounded-2xl border border-white/10 bg-gray-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {tab !== "reset" && (
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-2xl border border-white/10 bg-gray-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        <button
          onClick={
            tab === "login"
              ? handleLogin
              : tab === "signup"
              ? handleSignup
              : handleReset
          }
          className="w-full rounded-full bg-yellow-400 px-4 py-3 font-black text-black hover:bg-yellow-300"
        >
          {tab === "login"
            ? "Log In"
            : tab === "signup"
            ? "Sign Up"
            : "Send Reset Link"}
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-2xl bg-gray-950 p-3 text-sm text-yellow-300">
          {message}
        </p>
      )}
    </div>
  );
}
