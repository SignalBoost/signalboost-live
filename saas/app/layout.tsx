@tailwind base;
@tailwind components;
@tailwind utilities;

/* =========================================================
   CONTRAST TOKENS — single source of truth for surfaces.
   Iterate values here, all components inherit the change.
   ========================================================= */
:root {
  /* Page background (matches body bg in layout.tsx) */
  --bg-base: #0f1117;

  /* Card surfaces — layered above the animated mesh.
     Each level is more opaque than the last so cards stand out
     against the colored fog from the mesh gradients.        */
  --surface-1: rgba(20, 24, 36, 0.72);   /* primary cards (projects, panels) */
  --surface-2: rgba(28, 32, 46, 0.78);   /* nested elements inside cards    */
  --surface-3: rgba(36, 42, 58, 0.85);   /* inputs, selects, interactive    */

  /* Hover/active states — slightly brighter than their base */
  --surface-1-hover: rgba(28, 34, 48, 0.85);
  --surface-3-hover: rgba(44, 52, 70, 0.92);

  /* Borders — strong enough to be visible against surfaces */
  --border-soft:   rgba(255, 255, 255, 0.10);
  --border-medium: rgba(255, 255, 255, 0.16);
  --border-strong: rgba(255, 255, 255, 0.24);

  /* Accent borders for focus/active */
  --border-blue:  rgba(59, 130, 246, 0.55);
  --border-gold:  rgba(255, 195, 0, 0.45);

  /* Text */
  --text-primary:   #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.72);
  --text-muted:     rgba(255, 255, 255, 0.50);
  --text-faint:     rgba(255, 255, 255, 0.32);

  /* Brand */
  --blue: #3b82f6;
  --gold: #ffc300;
  --green: #4ade80;
  --red: #ef4444;
}

/* Utility class — apply to any container that needs to sit cleanly
   above the mesh. Adds a subtle backdrop blur + dark wash so the
   colored mesh fog does not leak through.                       */
.sb-card {
  background: var(--surface-1);
  border: 1px solid var(--border-soft);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.sb-card:hover {
  border-color: var(--border-medium);
}

.sb-input {
  background: var(--surface-3);
  border: 1px solid var(--border-medium);
  color: var(--text-primary);
}

.sb-input:focus {
  border-color: var(--border-blue);
  outline: none;
}

@keyframes meshFloat1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(8vw, 6vh) scale(1.1); }
}
@keyframes meshFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(-7vw, 4vh) scale(1.08); }
}
@keyframes meshFloat3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(5vw, -5vh) scale(1.05); }
}
@keyframes meshFloat4 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(-6vw, -4vh) scale(1.1); }
}
