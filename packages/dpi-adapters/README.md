# @krediwall/dpi-adapters

Indian fraud-feed adapters for [Krediwall](https://github.com/peopleofproduct/krediwall):
DoT's Financial Fraud Risk Indicator (FRI) delivered through the Digital
Intelligence Platform. DPI here means Digital Public Infrastructure, not
deep packet inspection.

`InMemoryFeed` keeps numbers as keyed-HMAC digests;
`loadFriSnapshotFile` ingests a strictly-validated JSON snapshot from disk
with staleness reporting; `feedReputationRule` wraps feeds as a firewall
rule (BLOCK on listed numbers, REVIEW on risk scores). The library never
calls a government API — you supply the snapshot.

```ts
const feed = friFeed(process.env.FRI_HMAC_KEY!);
loadFriSnapshotFile(feed, '/var/feeds/fri-latest.json', { maxAgeMs: 6 * 3_600_000 });
const rule = feedReputationRule([feed]);
```

Docs: [feed snapshot format](https://github.com/peopleofproduct/krediwall/blob/main/docs/feed-snapshot-format.md)

Apache-2.0 — see LICENSE. Copyright 2026 Kapil.
