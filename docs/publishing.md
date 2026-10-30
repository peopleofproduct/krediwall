# Publishing the packages

How `@krediwall/*` reaches npm so a lender can start with
`npm install @krediwall/enterprise-proxy` instead of cloning this repo.

## Before every publish

```bash
npm run build        # clean compile
npm test             # the full suite gates every publish
npm run publish:check # npm pack dry-run per package — inspect the file list
```

`publish:check` runs `npm publish --workspaces --dry-run`, which packs each
package without touching the registry. Read each tarball's file list: it
must contain `dist/**`, `package.json`, `README.md`, `LICENSE` and
`NOTICE`, and nothing else (`files: ["dist", "NOTICE"]` keeps source out;
npm always adds the README, licence and package manifest). Each package's
`prepublishOnly` re-compiles as a final guard.

**Always pack from a clean build.** `tsc -b` is incremental — deleted
source files leave stale artifacts in `dist/` that would ship in the
tarball. Before publishing: `find . -name "*.tsbuildinfo" -not -path
"*/node_modules/*" -delete && rm -rf packages/*/dist && npm run build`.

## Versions

All four packages share one version (see CHANGELOG for the current one).
Bump them together — `@krediwall/enterprise-proxy` pins
`@krediwall/core` and `@krediwall/telemetry-rules` at the same version,
so a partial bump breaks the workspace resolution.

```bash
# once per release, at the repo root
node -e "const fs=require('fs');const v=process.argv[1];
for (const p of ['packages/core','packages/telemetry-rules','packages/dpi-adapters','packages/enterprise-proxy']) {
  const path=p+'/package.json'; const j=JSON.parse(fs.readFileSync(path,'utf8'));
  j.version=v;
  for (const k of ['dependencies','peerDependencies']) {
    if (j[k]) for (const d of Object.keys(j[k])) if (d.startsWith('@krediwall/')) j[k][d]=v;
  }
  fs.writeFileSync(path, JSON.stringify(j,null,2)+'\n');
}
const j=JSON.parse(fs.readFileSync('package.json','utf8')); j.version=v;
fs.writeFileSync('package.json', JSON.stringify(j,null,2)+'\n');" 0.2.0

npm install          # re-resolve workspace versions
npm publish --workspaces --access public
```

## One-time setup

- The `krediwall` npm **org must exist** (npmjs.com → Create Organization)
  and the publishing account must be an owner.
- **Provenance is on by default** on modern npm when publishing from CI;
  from a local terminal it is not. Publishing from a tagged CI job is the
  more defensible path for bank procurement teams that check artifact
  origin — `npm ci && npm test && npm publish --workspaces`.
- The registry API key never goes in the repo; use an environment-provided
  token (`NPM_CONFIG__AUTH`, or your CI's npm integration).

## What each package is

| Package | Runtime deps | Depends on |
|---|---|---|
| `@krediwall/core` | none | — |
| `@krediwall/telemetry-rules` | none | core |
| `@krediwall/dpi-adapters` | none | core |
| `@krediwall/enterprise-proxy` | none | core, telemetry-rules |

All four are dependency-free at runtime — a lender's `npm install` adds
nothing beyond the packages themselves.

## After publishing

Update the README install snippet, tag the repo (`git tag v0.2.0`),
and verify from a clean directory:

```bash
npm install @krediwall/enterprise-proxy
node -e "const {KrediwallAdapter}=require('@krediwall/enterprise-proxy'); console.log(typeof KrediwallAdapter)"
```
