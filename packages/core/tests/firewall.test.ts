import { FirewallEngine } from '../src/engine';
import type { Rule, RuleHit, Transaction } from '../src/types';
import { Verdict } from '../src/types';

const txn = (overrides: Partial<Transaction>): Transaction => ({
  txnId: 'txn-1',
  creditLineId: 'line-1',
  payerVpa: 'user@okhdfc',
  payeeVpa: 'merchant@paytm',
  amountPaise: 50_000_00,
  creditLimitPaise: 1_00_000_00,
  timestampMs: 1_700_000_000_000,
  terminalVerified: true,
  ...overrides,
});

const verdictRule = (name: string, verdict: Verdict, fire: boolean): Rule => ({
  name,
  evaluate: (): RuleHit | null =>
    fire ? { rule: name, verdict, reason: `${name} fired` } : null,
});

describe('FirewallEngine', () => {
  it('returns ALLOW when no rule fires', () => {
    const engine = new FirewallEngine([verdictRule('noop', Verdict.Block, false)]);
    expect(engine.evaluate(txn({})).verdict).toBe(Verdict.Allow);
  });

  it('escalates to the worst verdict across firing rules', () => {
    const engine = new FirewallEngine([
      verdictRule('a.review', Verdict.Review, true),
      verdictRule('b.block', Verdict.Block, true),
    ]);
    const result = engine.evaluate(txn({}));
    expect(result.verdict).toBe(Verdict.Block);
    expect(result.hits.map((h) => h.rule)).toEqual(['a.review', 'b.block']);
  });

  it('short-circuits on BLOCK and does not run later rules', () => {
    let ran = false;
    const tail: Rule = {
      name: 'tail',
      evaluate: () => {
        ran = true;
        return null;
      },
    };
    const engine = new FirewallEngine([verdictRule('b.block', Verdict.Block, true), tail]);
    engine.evaluate(txn({}));
    expect(ran).toBe(false);
  });

  it('reset clears accumulated rule state', () => {
    let count = 0;
    const stateful: Rule = {
      name: 'counter',
      evaluate: () => {
        count += 1;
        return null;
      },
      reset: () => {
        count = 0;
      },
    };
    const engine = new FirewallEngine([stateful]);
    engine.evaluate(txn({}));
    expect(count).toBe(1);
    engine.reset();
    expect(count).toBe(0);
  });

  it('smoke test: mean evaluation latency stays far inside the 5ms budget', () => {
    // A stateful rule doing realistic per-entity work (Map + arithmetic),
    // standing in for the telemetry-rules heuristics. This is a sequential
    // smoke test of the mean only; tail latency (p99/p99.9), GC behaviour and
    // the real rule set are measured by `npm run bench`.
    const seen = new Map<string, number>();
    const velocityish: Rule = {
      name: 'velocityish',
      evaluate: (t, ctx) => {
        const n = (seen.get(t.creditLineId) ?? 0) + 1;
        seen.set(t.creditLineId, n);
        return n > 5 && ctx.nowMs - t.timestampMs < 60_000
          ? { rule: 'velocityish', verdict: Verdict.Block, reason: 'burst' }
          : null;
      },
    };
    const engine = new FirewallEngine([velocityish]);

    const STREAM = 5_000;
    let totalMicros = 0;
    let blocked = 0;
    for (let i = 0; i < STREAM; i++) {
      const result = engine.evaluate(
        txn({ txnId: `txn-${i}`, timestampMs: 1_700_000_000_000 + i * 10 }),
      );
      totalMicros += result.elapsedMicros;
      if (result.verdict === Verdict.Block) blocked += 1;
    }

    expect(engine.evaluatedCount).toBe(STREAM);
    expect(blocked).toBe(STREAM - 5); // first 5 txns under threshold
    expect(totalMicros / STREAM).toBeLessThan(5_000); // mean < 5ms per eval
  });
});

describe('FirewallEngine hardening', () => {
  it('isolates a throwing rule: evaluation continues, error is recorded', () => {
    const broken: Rule = {
      name: 'broken',
      evaluate: () => {
        throw new Error('boom');
      },
    };
    const engine = new FirewallEngine([
      broken,
      verdictRule('ok.block', Verdict.Block, true),
    ]);
    const result = engine.evaluate(txn({}));
    expect(result.verdict).toBe(Verdict.Block);
    expect(result.ruleErrors).toEqual([{ rule: 'broken', message: 'boom' }]);
  });

  it('reports thrown rules through onRuleError', () => {
    const seen: string[] = [];
    const broken: Rule = {
      name: 'broken',
      evaluate: () => {
        throw new Error('nope');
      },
    };
    const engine = new FirewallEngine([broken], {
      onRuleError: (rule) => seen.push(rule),
    });
    engine.evaluate(txn({}));
    expect(seen).toEqual(['broken']);
  });

  it('returns REVIEW on a malformed transaction instead of a silent ALLOW', () => {
    const engine = new FirewallEngine([verdictRule('noop', Verdict.Allow, false)]);
    const result = engine.evaluate(txn({ timestampMs: Number.NaN }));
    expect(result.verdict).toBe(Verdict.Review);
    expect(result.ruleErrors[0]?.rule).toBe('engine');
  });

  it('invokes onEvaluation once per call and survives a throwing sink', () => {
    let calls = 0;
    const engine = new FirewallEngine([], {
      onEvaluation: () => {
        calls += 1;
        throw new Error('sink down');
      },
    });
    const result = engine.evaluate(txn({}));
    expect(result.verdict).toBe(Verdict.Allow);
    expect(calls).toBe(1);
    expect(engine.hookErrorCount).toBe(1);
  });

  it('exports and restores per-rule state for restart warm-up', () => {
    let n = 0;
    const stateful: Rule = {
      name: 'counter',
      evaluate: () => {
        n += 1;
        return n > 3 ? { rule: 'counter', verdict: Verdict.Block, reason: 'burst' } : null;
      },
      exportState: () => ({ n }),
      restoreState: (s: unknown) => {
        n = (s as { n: number }).n;
      },
    };
    const engine = new FirewallEngine([stateful]);
    engine.evaluate(txn({}));
    engine.evaluate(txn({}));
    const snap = engine.exportState();

    n = 99; // simulate restart wiping state
    const restored = new FirewallEngine([stateful]);
    restored.restoreState(snap);
    restored.evaluate(txn({}));
    restored.evaluate(txn({})); // n: 2 -> 3 -> 4, blocks on the second eval
    const third = restored.evaluate(txn({}));
    expect(third.verdict).toBe(Verdict.Block);
  });

  it('throws on an unknown snapshot version', () => {
    const engine = new FirewallEngine([]);
    expect(() =>
      engine.restoreState({ version: 99, exportedAtMs: 0, rules: {} } as never),
    ).toThrow('unsupported snapshot version');
  });
});

describe('FirewallEngine metrics', () => {
  it('counts evaluations, verdicts, rule hits and rule errors', () => {
    const flaky: Rule = {
      name: 'flaky',
      evaluate: (t) => {
        if (t.txnId === 'boom') throw new Error('boom');
        return t.txnId === 'hit'
          ? { rule: 'flaky', verdict: Verdict.Review, reason: 'flagged' }
          : null;
      },
    };
    const engine = new FirewallEngine([flaky]);
    engine.evaluate(txn({ txnId: 'ok' }));
    engine.evaluate(txn({ txnId: 'hit' }));
    engine.evaluate(txn({ txnId: 'boom' }));

    const m = engine.metrics;
    expect(m.evaluated).toBe(3);
    // 'boom' threw and was isolated — the txn still counts as ALLOW
    expect(m.verdicts).toEqual({ allow: 2, review: 1, block: 0 });
    expect(m.ruleHits).toEqual({ flaky: 1 });
    expect(m.ruleErrors).toEqual({ flaky: 1 });
  });

  it('flags degraded on malformed input and throwing rules, not on clean evals', () => {
    const broken: Rule = {
      name: 'broken',
      evaluate: () => {
        throw new Error('x');
      },
    };
    const engine = new FirewallEngine([broken]);
    expect(engine.evaluate(txn({})).degraded).toBe(true);

    const clean = new FirewallEngine([]);
    expect(clean.evaluate(txn({})).degraded).toBe(false);
    expect(clean.evaluate(txn({ amountPaise: Number.NaN })).degraded).toBe(true);
  });

  it('aggregates per-rule stats keyed by rule name', () => {
    const sensor: Rule = {
      name: 'sensor',
      evaluate: () => null,
      stats: () => ({ trackedLines: 7, evictedLines: 2 }),
    };
    const engine = new FirewallEngine([sensor, { name: 'quiet', evaluate: () => null }]);
    expect(engine.ruleStats()).toEqual({ sensor: { trackedLines: 7, evictedLines: 2 } });
  });

  it('resets counters on reset()', () => {
    const engine = new FirewallEngine([verdictRule('hit.always', Verdict.Block, true)]);
    engine.evaluate(txn({}));
    engine.reset();
    const m = engine.metrics;
    expect(m.evaluated).toBe(0);
    expect(m.verdicts).toEqual({ allow: 0, review: 0, block: 0 });
    expect(m.ruleHits).toEqual({ 'hit.always': 0 });
  });
});

describe('FirewallEngine dedupe and latency', () => {
  it('returns the original verdict for a repeated txnId without touching rule state', () => {
    let evals = 0;
    const counter: Rule = {
      name: 'counter',
      evaluate: () => {
        evals += 1;
        return evals > 1 ? { rule: 'counter', verdict: Verdict.Block, reason: 'again' } : null;
      },
    };
    const engine = new FirewallEngine([counter], { dedupeCapacity: 100 });
    const first = engine.evaluate(txn({ txnId: 'dup-1' }));
    const second = engine.evaluate(txn({ txnId: 'dup-1' })); // retry — same id
    expect(second).toBe(first); // identical Evaluation object
    expect(evals).toBe(1); // rule never saw the retry
    expect(engine.metrics.deduped).toBe(1);
    // A different txnId evaluates normally and (for this test rule) blocks.
    expect(engine.evaluate(txn({ txnId: 'new-1' })).verdict).toBe(Verdict.Block);
  });

  it('evicts the oldest dedupe entry past capacity', () => {
    const engine = new FirewallEngine([], { dedupeCapacity: 2 });
    engine.evaluate(txn({ txnId: 'a' }));
    engine.evaluate(txn({ txnId: 'b' }));
    engine.evaluate(txn({ txnId: 'c' })); // evicts 'a'
    const again = engine.evaluate(txn({ txnId: 'a' }));
    expect(engine.metrics.deduped).toBe(0); // 'a' was forgotten → fresh eval
    expect(again.verdict).toBe(Verdict.Allow);
  });

  it('leaves dedupe off by default', () => {
    const engine = new FirewallEngine([]);
    engine.evaluate(txn({ txnId: 'x' }));
    engine.evaluate(txn({ txnId: 'x' }));
    expect(engine.metrics.deduped).toBe(0);
    expect(engine.metrics.evaluated).toBe(2);
  });

  it('records evaluation latency into histogram buckets', () => {
    const engine = new FirewallEngine([]);
    engine.evaluate(txn({}));
    engine.evaluate(txn({}));
    const m = engine.metrics.latencyMicros;
    const total = m.counts.reduce((a, c) => a + c, 0);
    expect(total).toBe(2);
    expect(m.sum).toBeGreaterThan(0);
    expect(m.buckets.length).toBe(m.counts.length - 1); // last count is +Inf
  });
});
