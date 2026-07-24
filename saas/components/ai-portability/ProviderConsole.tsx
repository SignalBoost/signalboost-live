// saas/components/ai-portability/ProviderConsole.tsx
/**
 * AI Portability — Provider Console (UI)
 * -------------------------------------------------------------------------
 * Manual provider dropdown + Auto-Optimize toggle. Host-agnostic: it talks to
 * whatever `apiBase` you mount the HTTP handler under and carries no
 * platform-specific imports or styling — restyle freely with your design
 * system. Only dependency: React.
 */

import React, { useEffect, useState } from 'react';

interface ProviderMeta {
  id: string;
  label: string;
  capabilities: string[];
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  avg_latency_ms: number;
}

interface UnifiedResponse {
  output: string;
  tokens_used: { input: number; output: number; total: number };
  provider: string;
  latency_ms: number;
  cost_usd: number;
}

type Policy = 'cost' | 'latency' | 'capability' | 'auto';

export interface ProviderConsoleProps {
  /** Base path where the HTTP handler is mounted. */
  apiBase?: string;
  /** Optional default tenant tag for billing/audit. */
  tenant?: string;
}

export function ProviderConsole({
  apiBase = '/api/ai-portability',
  tenant,
}: ProviderConsoleProps) {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [prompt, setPrompt] = useState('');
  const [auto, setAuto] = useState(true);
  const [provider, setProvider] = useState('');
  const [policy, setPolicy] = useState<Policy>('auto');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UnifiedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/providers`)
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers ?? []);
        if (d.providers?.[0]) setProvider(d.providers[0].id);
      })
      .catch((e) => setError(String(e)));
  }, [apiBase]);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: any = {
        prompt,
        metadata: { tenant, policy: auto ? policy : 'manual' },
      };
      if (!auto) body.provider = provider;

      const res = await fetch(`${apiBase}/invoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'request failed');
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="aip-console" style={S.wrap}>
      <div style={S.row}>
        <label style={S.toggle}>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span>Auto-Optimize</span>
        </label>

        {auto ? (
          <select
            aria-label="Routing policy"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as Policy)}
            style={S.select}
          >
            <option value="auto">Auto (capability + cost)</option>
            <option value="cost">Cheapest</option>
            <option value="latency">Fastest</option>
            <option value="capability">Best capability match</option>
          </select>
        ) : (
          <select
            aria-label="Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={S.select}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — ${p.cost_per_1k_output}/1k out · ~{p.avg_latency_ms}ms
              </option>
            ))}
          </select>
        )}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter a prompt…"
        rows={4}
        style={S.textarea}
      />

      <button onClick={run} disabled={loading || !prompt} style={S.button}>
        {loading ? 'Routing…' : auto ? 'Run (Auto)' : `Run on ${provider}`}
      </button>

      {error && <div style={S.error}>{error}</div>}

      {result && (
        <div style={S.result}>
          <div style={S.output}>{result.output}</div>
          <div style={S.meta}>
            <span>Provider: <b>{result.provider}</b></span>
            <span>Tokens: {result.tokens_used.total}</span>
            <span>Latency: {result.latency_ms}ms</span>
            <span>Cost: ${result.cost_usd.toFixed(6)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* Minimal inline styles — override or delete and use your design system. */
const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 },
  row: { display: 'flex', gap: 12, alignItems: 'center' },
  toggle: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' },
  select: { padding: '6px 8px', flex: 1 },
  textarea: { padding: 8, fontFamily: 'inherit', resize: 'vertical' },
  button: { padding: '8px 14px', cursor: 'pointer', alignSelf: 'flex-start' },
  error: { color: '#b00020', fontSize: 14 },
  result: { border: '1px solid #ddd', borderRadius: 8, padding: 12 },
  output: { whiteSpace: 'pre-wrap', marginBottom: 8 },
  meta: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#555' },
};

export default ProviderConsole;
