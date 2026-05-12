"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Project = {
  id: string;
  name: string;
  description: string;
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setProjects(data || []);
  }

  async function createProject() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("You must be logged in.");
      return;
    }

    const { error } = await supabase.from("projects").insert({
      user_id: user.id,
      name,
      description,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setDescription("");

    loadProjects();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "40px",
        }}
      >
        <h1
          style={{
            fontSize: "48px",
            color: "#FFD700",
          }}
        >
          Dashboard
        </h1>

        <button onClick={logout} style={button}>
          Logout
        </button>
      </div>

      <div
        style={{
          background: "#111722",
          padding: "24px",
          borderRadius: "20px",
          marginBottom: "40px",
        }}
      >
        <h2
          style={{
            marginBottom: "20px",
          }}
        >
          Create Project
        </h2>

        <input
          placeholder="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={input}
        />

        <textarea
          placeholder="Project Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{
            ...input,
            minHeight: "120px",
          }}
        />

        <button onClick={createProject} style={button}>
          Create Project
        </button>
      </div>

      <div>
        <h2
          style={{
            marginBottom: "20px",
          }}
        >
          Your Projects
        </h2>

        {projects.length === 0 ? (
          <p style={{ color: "#999" }}>
            No projects yet.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "20px",
            }}
          >
            {projects.map((project) => (
              <div
                key={project.id}
                style={{
                  background: "#111722",
                  padding: "24px",
                  borderRadius: "18px",
                }}
              >
                <h3
                  style={{
                    color: "#FFD700",
                    marginBottom: "10px",
                  }}
                >
                  {project.name}
                </h3>

                <p
                  style={{
                    color: "#999",
                  }}
                >
                  {project.description}
                </p>
              </div>
            ))}
          </div>
        )}
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
  padding: "14px 20px",
  borderRadius: "10px",
  border: 0,
  background: "#FFD700",
  color: "#000",
  fontWeight: "bold",
  cursor: "pointer",
};
