'use client';

// saas/app/dashboard/infrastructure/page.tsx
// Provider-agnostic approval cockpit. Renders every PR by mapping its
// `service` (provider) + `action` (actionId) strings dynamically — no
// hardcoded provider objects. High-risk PRs require a second confirm click.
import { useCallback, useEffect, useState } from 'react';

type Risk = 'low' | 'medium' | 'high';
type Status = 'open' | 'merging' | 'merged' | 'failed' | 'closed';

interface InfraPr {
  id: string;
  title: string;
  description: string | null;
  service: string; // provider
  action: string; // actionId
  payload: any;
  diff: any;
  risk: Risk;
  triggers_redeploy: boolean;
  source: 'assistant' | 'manual';
  status: Status;
  result: any;
  error: string | null;
  created_at: string;
  merged_at: string | null;
}

const GOLD = '#ffc300';
const CYAN = '#1af0ff';
const RED = '#ff5470';
const INK = '#0a1428';
const PANEL = 'linear-gradient(160deg, #0d1b34 0%, #0a1428 100%)';
const HAIR = 'rgba(255,255,255,0.08)';

const riskColor: Record<Risk, string> = { low: CYAN, medium: GOLD, high: RED };

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}
function json(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function InfrastructurePrPage() {
  const [prs, setPrs] = useState<InfraPr[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch('/api/infra-pr', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load');
      setPrs(data.prs || []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runMerge(id: string) {
    setBusy((b) => ({ ...b, [id]: true }));
    setConfirming((c) => ({ ...c, [id]: false }));
    setErr(null);
    try {
      const res = await fetch(`/api/infra-pr/${id}/merge`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Merge failed');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Merge failed');
      await load();
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  // High-risk needs an explicit second click; low/medium merge on first click.
  function onMergeClick(pr: InfraPr) {
    if (pr.risk === 'high' && !confirming[pr.id]) {
      setConfirming((c) => ({ ...c, [pr.id]: true }));
      return;
    }
    runMerge(pr.id);
  }

  async function close(id: string) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await fetch(`/api/infra-pr/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  }

  const openPrs = prs.filter((p) => p.status === 'open' || p.status === 'merging');
  const history = prs.filter((p) => p.status !== 'open' && p.status !== 'merging');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: INK,
        color: '#e8eefc',
        padding: '28px 22px 80px',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.3, margin: 0 }}>
            Open Pull Requests
          </h1>
          <button onClick={load} style={ghostBtn}>
            Refresh
          </button>
        </div>
        <p style={{ color: 'rgba(232,238,252,0.55)', fontSize: 13, marginTop: 6 }}>
          AI-drafted infrastructure changes across all providers. Nothing fires until you merge.
        </p>

        {err && <div style={{ ...banner, borderColor: RED, color: RED }}>{err}</div>}

        {loading && <div style={{ color: 'rgba(232,238,252,0.5)', marginTop: 24 }}>Loading…</div>}

        {!loading && openPrs.length === 0 && (
          <div style={{ ...banner, borderColor: HAIR, color: 'rgba(232,238,252,0.6)' }}>
            No open PRs. The Chief of Staff will queue changes here for approval.
          </div>
        )}

        {openPrs.map((pr) => {
          const isHigh = pr.risk === 'high';
          const awaiting = !!confirming[pr.id];
          return (
            <div key={pr.id} style={{ ...card, borderColor: awaiting ? RED : HAIR }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={badge(CYAN)}>{pr.service}</span>
                <span style={{ ...badge('rgba(255,255,255,0.4)'), textTransform: 'none' }}>
                  {pr.action}
                </span>
                <span style={badge(riskColor[pr.risk])}>{pr.risk} risk</span>
                {pr.triggers_redeploy && <span style={badge(GOLD)}>redeploys</span>}
                <span style={{ ...badge('rgba(255,255,255,0.3)'), textTransform: 'none' }}>
                  {pr.source}
                </span>
              </div>

              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10 }}>{pr.title}</div>
              {pr.description && (
                <div style={{ fontSize: 13, color: 'rgba(232,238,252,0.7)', marginTop: 4 }}>
                  {pr.description}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(232,238,252,0.4)',
                  marginTop: 8,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {fmt(pr.created_at)}
              </div>

              <button
                onClick={() => setOpen((o) => ({ ...o, [pr.id]: !o[pr.id] }))}
                style={{ ...ghostBtn, marginTop: 12 }}
              >
                {open[pr.id] ? 'Hide payload' : 'Inspect payload'}
              </button>

              {open[pr.id] && (
                <div style={{ marginTop: 10 }}>
                  {pr.diff && (
                    <>
                      <div style={codeLabel}>diff</div>
                      <pre style={codeBlock}>{json(pr.diff)}</pre>
                    </>
                  )}
                  <div style={codeLabel}>payload → /api/hub/action</div>
                  <pre style={codeBlock}>{json(pr.payload)}</pre>
                </div>
              )}

              {awaiting && (
                <div style={{ ...banner, borderColor: RED, color: RED, marginTop: 14 }}>
                  High-risk action. This runs live on <b>{pr.service}</b> and cannot be undone.
                  Confirm to proceed.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => onMergeClick(pr)}
                  disabled={busy[pr.id] || pr.status === 'merging'}
                  style={mergeBtn(busy[pr.id] || pr.status === 'merging', awaiting)}
                >
                  {busy[pr.id] || pr.status === 'merging'
                    ? 'Merging…'
                    : awaiting
                    ? 'Confirm — run live'
                    : isHigh
                    ? 'Merge / Approve (high risk)'
                    : 'Merge / Approve'}
                </button>

                {awaiting ? (
                  <button
                    onClick={() => setConfirming((c) => ({ ...c, [pr.id]: false }))}
                    disabled={busy[pr.id]}
                    style={ghostBtn}
                  >
                    Cancel
                  </button>
                ) : (
                  <button onClick={() => close(pr.id)} disabled={busy[pr.id]} style={ghostBtn}>
                    Close
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {history.length > 0 && (
          <>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginTop: 36,
                color: 'rgba(232,238,252,0.6)',
              }}
            >
              History
            </h2>
            {history.map((pr) => (
              <div key={pr.id} style={{ ...card, opacity: 0.82 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={badge(statusColor(pr.status))}>{pr.status}</span>
                  <span style={badge('rgba(255,255,255,0.3)')}>{pr.service}</span>
                  <span style={{ ...badge('rgba(255,255,255,0.3)'), textTransform: 'none' }}>
                    {pr.action}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{pr.title}</span>
                </div>
                {pr.error && <div style={{ color: RED, fontSize: 12, marginTop: 8 }}>{pr.error}</div>}
                {pr.status === 'merged' && pr.result?.redeploy?.triggered && (
                  <div style={{ color: GOLD, fontSize: 12, marginTop: 8 }}>
                    Production redeploy triggered.
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(232,238,252,0.4)', marginTop: 8 }}>
                  {pr.merged_at ? `merged ${fmt(pr.merged_at)}` : fmt(pr.created_at)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function statusColor(s: Status): string {
  if (s === 'merged') return CYAN;
  if (s === 'failed') return RED;
  return 'rgba(255,255,255,0.35)';
}

const card: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${HAIR}`,
  borderRadius: 14,
  padding: 18,
  marginTop: 16,
};

const banner: React.CSSProperties = {
  border: '1px solid',
  borderRadius: 10,
  padding: '12px 14px',
  marginTop: 18,
  fontSize: 13,
};

function badge(color: string): React.CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color,
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: '2px 8px',
  };
}

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'rgba(232,238,252,0.8)',
  border: `1px solid ${HAIR}`,
  borderRadius: 8,
  padding: '7px 12px',
  fontSize: 12.5,
  cursor: 'pointer',
};

function mergeBtn(disabled: boolean, danger: boolean): React.CSSProperties {
  const base = danger ? RED : GOLD;
  return {
    background: disabled ? 'rgba(255,195,0,0.35)' : base,
    color: danger ? '#fff' : INK,
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
  };
}

const codeLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'rgba(232,238,252,0.45)',
  marginTop: 10,
  marginBottom: 4,
};

const codeBlock: React.CSSProperties = {
  background: '#06101f',
  border: `1px solid ${HAIR}`,
  borderRadius: 8,
  padding: 12,
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  color: CYAN,
  overflowX: 'auto',
  margin: 0,
  whiteSpace: 'pre',
};
