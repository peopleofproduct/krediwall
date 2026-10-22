# FRI snapshot file format (v1)

`@krediwall/dpi-adapters` loads fraud-feed snapshots from a JSON file on
disk. The file is something *your* pipeline produces: FRI classifications
reach onboarded stakeholders through DoT's Digital Intelligence Platform,
and this library never calls a government API. This document describes the
file you hand to `loadFriSnapshotFile(feed, path, opts)`.

## Shape

```jsonc
{
  "version": 1,
  "generatedAtMs": 1760000000000,   // epoch ms — when the snapshot was cut
  "entries": [
    { "mobile": "9876543210", "level": "very_high" },  // DoT FRI band
    { "mobile": "9123456789", "listed": true },          // hard-listed
    { "mobile": "9988776655", "riskScore": 0.8 }          // custom score
  ]
}
```

- `version` — must be `1` when present.
- `generatedAtMs` — optional but recommended; drives the staleness check.
- `entries` — required array. Each row needs an identifier — `mobile`,
  `vpa` or both — plus **one** signal:
  - `level`: one of `"medium"`, `"high"`, `"very_high"` (mapped to risk
    scores 0.5 / 0.75 / 1.0 by the library — that mapping is our policy,
    not a DoT value);
  - `listed`: `true` marks the identifier hard-listed (a BLOCK signal);
  - `riskScore`: a number in `[0, 1]` for non-FRI feeds.

`mobile` accepts the usual Indian formats — `9876543210`, `+919876543210`,
`09876 543210` — and is normalised to 10 digits before storage. `vpa` rows
are trimmed and lowercased and are for feeds that identify mule *accounts*
rather than phones (bank-internal blocklists, suspect registries); the two
identifier spaces are namespaced and can never cross-match. Rows whose
identifiers all fail normalisation, or that carry no signal, are rejected,
not silently loaded.

## Loader semantics

```ts
const feed = friFeed(process.env.FRI_HMAC_KEY!);
const result = loadFriSnapshotFile(feed, '/var/feeds/fri-latest.json', {
  maxAgeMs: 6 * 3_600_000, // flag stale if older than 6h
});
// result: { loaded, rejected, generatedAtMs, stale, sampleErrors }
```

- Loading **replaces** the previous snapshot atomically per ingest call.
- `stale: true` means `generatedAtMs` is older than `maxAgeMs`. The data is
  still loaded — stale coverage beats none — but alert on it; a frozen feed
  is a coverage outage.
- `sampleErrors` carries up to 5 rejection reasons for ops debugging.
- `maxRows` (default 5M) guards against a corrupt or truncated file loading
  unbounded data.
- The file is read synchronously; do it on startup and on a snapshot-refresh
  cadence, not per transaction.

## Operational notes

- **Never commit real snapshots.** Numbers are stored as keyed HMAC
  digests, but the 10-digit mobile space is enumerable — protect the key
  and the file.
- If your DIP feed is mobile-keyed CSV rather than JSON, translate upstream
  and emit this format; keep the adapter thin.
- Phone-number VPAs match mobile rows directly. For `merchant@paytm`-style
  handles there are two routes: wire `resolveMobile` (your merchant
  registry — every onboarded merchant has a mobile on file) into
  `feedReputationRule`, or ship `vpa`-keyed rows from feeds that identify
  accounts. Payees matching none pass through unchecked — that is a data
  limitation, not a bug.
