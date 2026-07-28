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
import { uiText } from '@/lib/i18n/uiText'

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
          <span>{uiText('generatedUi.u_5e8d38c5655a285f')}</span>
        </label>

        {auto ? (
          <select
            aria-label={uiText('generatedUi.u_a9f96a7a54d821a6')}
            value={policy}
            onChange={(e) => setPolicy(e.target.value as Policy)}
            style={S.select}
          >
            <option value="auto">{uiText('generatedUi.u_ca5f6a4acf0e31d5')}</option>
            <option value="cost">{uiText('generatedUi.u_d46b1b8f5c7aef79')}</option>
            <option value="latency">{uiText('generatedUi.u_7ef7a92e55a79eba')}</option>
            <option value="capability">{uiText('generatedUi.u_87897aae99503d48')}</option>
          </select>
        ) : (
          <select
            aria-label={uiText('generatedUi.u_472590ae974d4c1f')}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={S.select}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — ${p.cost_per_1k_output}{uiText('generatedUi.u_6340eae9981b4620')}{p.avg_latency_ms}{uiText('generatedUi.u_f785c3ce1d580c8f')} </option>
            ))}
          </select>
        )}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={uiText('generatedUi.u_0f3bb0f12ebe5f5d')}
        rows={4}
        style={S.textarea}
      />

      <button onClick={run} disabled={loading || !prompt} style={S.button}>
        {loading ? uiText('generatedUi.u_effe03a8da48932b') : auto ? uiText('generatedUi.u_a9a472f75d2be5bc') : `Run on ${provider}`}
      </button>

      {error && <div style={S.error}>{error}</div>}

      {result && (
        <div style={S.result}>
          <div style={S.output}>{result.output}</div>
          <div style={S.meta}>
            <span>{uiText('generatedUi.u_672f1efd8b87117f')}<b>{result.provider}</b></span>
            <span>{uiText('generatedUi.u_e1c97fd10751a864')}{result.tokens_used.total}</span>
            <span>{uiText('generatedUi.u_7839136b0629d888')}{result.latency_ms}{uiText('generatedUi.u_f785c3ce1d580c8f')}</span>
            <span>{uiText('generatedUi.u_564970ae3734b7c1')}{result.cost_usd.toFixed(6)}</span>
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
