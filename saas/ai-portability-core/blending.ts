// saas/ai-portability-core/blending.ts
/**
 * AI Portability — Blending Layer (advanced)
 * -------------------------------------------------------------------------
 * Runs several providers on one request and merges the results:
 *   ensemble  — call all in parallel, return the best candidate + all others
 *   voting    — majority answer across providers (normalized match)
 *   fusion    — synthesize a single answer from all candidates via a fuser
 * Aggregate tokens/cost across every provider touched, so billing stays exact.
 */

import {
  UnifiedRequest,
  UnifiedResponse,
  BlendCandidate,
} from './schema';
import { HostContext } from './host';
import { AiProviderRegistry } from './registry';

export type BlendStrategy = 'ensemble' | 'voting' | 'fusion';

export interface BlendOptions {
  strategy: BlendStrategy;
  providers: string[];
  /** For fusion: which provider synthesizes. Defaults to providers[0]. */
  fuser?: string;
  /** For ensemble: how to pick the primary. Default: longest output. */
  pick?: 'longest' | 'first';
}

export class Blender {
  private registry: AiProviderRegistry
  private host: HostContext
  constructor(
    registry: AiProviderRegistry,
    host: HostContext,
  ) { this.registry = registry; this.host = host;}

  async blend(
    req: UnifiedRequest,
    opts: BlendOptions,
  ): Promise<UnifiedResponse> {
    const ids = opts.providers.filter((id) => this.registry.has(id));
    if (ids.length < 2) {
      throw new Error('blending requires at least 2 registered providers');
    }

    const settled = await Promise.allSettled(
      ids.map((id) => this.registry.get(id).call(req, this.host)),
    );

    const candidates: BlendCandidate[] = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        const r = s.value;
        candidates.push({
          provider: ids[i],
          output: r.output,
          tokens_used: r.tokens_used,
          cost_usd: r.cost_usd,
          latency_ms: r.latency_ms,
        });
      } else {
        this.host.logger.warn('blend candidate failed', {
          provider: ids[i],
          error: String(s.reason?.message ?? s.reason),
        });
      }
    });

    if (!candidates.length) throw new Error('all blend candidates failed');

    switch (opts.strategy) {
      case 'voting':
        return this.vote(candidates);
      case 'fusion':
        return this.fuse(req, candidates, opts.fuser ?? ids[0]);
      case 'ensemble':
      default:
        return this.ensemble(candidates, opts.pick ?? 'longest');
    }
  }

  /* ------------------------------ ensemble ----------------------------- */
  private ensemble(
    candidates: BlendCandidate[],
    pick: 'longest' | 'first',
  ): UnifiedResponse {
    const primary =
      pick === 'first'
        ? candidates[0]
        : [...candidates].sort((a, b) => b.output.length - a.output.length)[0];
    return this.assemble('ensemble', primary.output, candidates, primary.provider);
  }

  /* ------------------------------- voting ------------------------------ */
  private vote(candidates: BlendCandidate[]): UnifiedResponse {
    const buckets = new Map<string, { count: number; c: BlendCandidate }>();
    for (const c of candidates) {
      const key = normalize(c.output);
      const b = buckets.get(key);
      if (b) b.count += 1;
      else buckets.set(key, { count: 1, c });
    }
    const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
    return this.assemble('voting', winner.c.output, candidates, winner.c.provider);
  }

  /* ------------------------------- fusion ------------------------------ */
  private async fuse(
    req: UnifiedRequest,
    candidates: BlendCandidate[],
    fuserId: string,
  ): Promise<UnifiedResponse> {
    const fuser = this.registry.get(fuserId);
    const synthPrompt =
      `You are combining multiple model answers into one superior answer, ` +
      `keeping the strongest reasoning and the clearest style.\n\n` +
      `Original request:\n${req.prompt}\n\n` +
      candidates
        .map((c, i) => `Answer ${i + 1} (${c.provider}):\n${c.output}`)
        .join('\n\n') +
      `\n\nReturn only the final combined answer.`;

    const fused = await fuser.call(
      { prompt: synthPrompt, temperature: req.temperature, max_tokens: req.max_tokens },
      this.host,
    );

    // Fusion cost = all candidates + the synthesis call.
    const withFuser: BlendCandidate[] = [
      ...candidates,
      {
        provider: `${fuserId}(fuser)`,
        output: fused.output,
        tokens_used: fused.tokens_used,
        cost_usd: fused.cost_usd,
        latency_ms: fused.latency_ms,
      },
    ];
    return this.assemble('fusion', fused.output, withFuser, `${fuserId}(fuser)`);
  }

  /* ------------------------------ assemble ----------------------------- */
  private assemble(
    strategy: BlendStrategy,
    output: string,
    candidates: BlendCandidate[],
    primary: string,
  ): UnifiedResponse {
    const input = sum(candidates, (c) => c.tokens_used.input);
    const outTok = sum(candidates, (c) => c.tokens_used.output);
    return {
      output,
      tokens_used: { input, output: outTok, total: input + outTok },
      provider: `blend:${strategy}[${candidates.map((c) => c.provider).join('+')}]`,
      // Parallel strategies: wall time ~ slowest. Fusion adds sequentially.
      latency_ms:
        strategy === 'fusion'
          ? sum(candidates, (c) => c.latency_ms)
          : Math.max(...candidates.map((c) => c.latency_ms)),
      cost_usd: Math.round(sum(candidates, (c) => c.cost_usd) * 1e6) / 1e6,
      metadata: { strategy, candidates, primary },
    };
  }
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  return arr.reduce((acc, t) => acc + f(t), 0);
}
