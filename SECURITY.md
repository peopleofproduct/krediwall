# Security Policy

Krediwall evaluates payment-fraud signals, so we take security seriously. The engine runs **in your process**; the library logs nothing and makes no outbound network calls.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security reports.

Use GitHub's private vulnerability reporting for this repository (**Security → Report a vulnerability**), which notifies the maintainers privately. Include:

- affected commit or version;
- reproduction steps or a proof of concept;
- impact assessment (for example: a way to evade a rule, crash the engine, exhaust memory, or leak identifiers).

If you cannot use private vulnerability reporting, email
**kapil@theproduct.city** with the same details.

We aim to acknowledge reports within 72 hours and will coordinate disclosure with you before publishing an advisory.

## Supported versions

The project is alpha. Published npm versions (see the badges on the
README) and the `main` branch are supported; report the affected
version or commit with your report.

## What the design does and does not guarantee

- `@krediwall/core`, `@krediwall/telemetry-rules` and `@krediwall/dpi-adapters` perform no network I/O and write no logs.
- `@krediwall/enterprise-proxy` opens a network listener only when an integrator calls `createHttpAdapter(...).listen(...)`. It validates request shape and caps request bodies at 16 KB, but it has **no authentication or TLS** — place it behind your own network controls.
- Rule state keeps 32-bit bucket hashes instead of raw VPAs. This is data minimisation, **not** a cryptographic privacy guarantee. Fraud-feed lookups use keyed HMAC digests; protect the key.
- Per-credit-line state is bounded (fixed-size rings, LRU-capped line count). A very large number of distinct credit lines evicts older lines, whose history then restarts.
- Rules are heuristics and can be evaded by a determined attacker. Krediwall is a screening aid, not a sole control.
