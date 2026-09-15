# TIM-27 — source-published artifact identities

This parent-owned seam connects the accepted identity bridge to the independently implemented CLI selector and trusted deployment controller. It does not enable broker allocations or deploy infrastructure.

## Interface

- `src/shared/preview-artifacts.ts` exports `PreviewArtifactManifestSchema` and `PreviewArtifactManifest`.
- Source-only `GET /api/preview/artifacts?origin=<exact-target-origin>&commit=<built-commit>` returns the manifest with `Cache-Control: no-store`. Missing/currently unavailable metadata returns `503 preview-artifacts-pending`. Invalid inputs are structured errors. There is no public write endpoint.
- `parsePreviewArtifactManifest(env, json)` parses at most **16 KiB** of publication JSON and validates the source/target origins, fixed package text paths and content-addressed URLs.
- `registerPreviewArtifacts(env, manifest)` is a trusted-controller function. It conditionally inserts against the active origin/incarnation/commit in the existing source registry and checks the result within one D1 batch. Equal retry payloads, including reordered JSON keys, are idempotent. A different identity for the same tuple returns `409 preview-artifact-conflict`.
- Migration **0006_preview_artifacts.sql** adds immutable descriptor storage. Number 0005 is reserved for the concurrently implemented broker. It has no dependency on that broker migration.

The manifest contains:

```ts
{
  version: 1,
  sourceOrigin, targetOrigin, incarnation, commit,
  executable: { url, sha256, bytes, version, protocols: [1, 2] },
  games: [
    { gameId: 'secret-overlord', protocol: 1, rulesVersion, archive, rules, skill, protocolFile },
    { gameId: 'succession', protocol: 2, rulesVersion, archive, rules, skill, protocolFile },
  ],
}
```

Archives are `{ url, sha256, bytes }`; text descriptors are `{ path, sha256, bytes }`. The executable URL is exactly `${sourceOrigin}/downloads/agent-game-cli-${version}.tgz`. Branch archives are exactly `${targetOrigin}/downloads/previews/${commit}/${sha256}.tgz`. Both games may share an archive; shared bytes and the common skill entry must agree.

Only these branch text paths are eligible:

- `package/public/rules.md`, `package/public/protocol.md` for Secret Overlord.
- `package/public/games/succession/rules.md`, `package/public/games/succession/protocol.md` for Succession.
- `package/skills/agent-game/SKILL.md` for the installed instruction artifact.

Archive bounds are **2 MiB compressed**; each text file is at most **128 KiB**. The CLI must independently verify downloaded byte count/hash, bounded archive expansion and regular-file paths before using text. It must not execute CLI code from the target archive. The trusted controller supplies the source executable descriptor from the trusted source release, rather than accepting a PR-provided source executable claim. The source function validates metadata, performs no remote URL fetching and does not prove artifact contents by itself.

`commit` is the independently verified **built merge commit**, not the mutable PR head or current merge ref. Redeployment to a different built commit requires a new descriptor. Active participation retains its already verified local pins; new selection discovers only the current registered tuple. Source retirement immediately makes old descriptors undiscoverable without deleting their audit records.

## Verification

`tests/preview-artifacts.test.ts` uses real local D1 migrations with source registration functions and the production route delegate. It covers current-only discovery, no-store/read-only responses, semantic retry, competing first publications, immutable rows, commit changes/retirement, source-only executable URLs, traversal/wrong-game paths, inconsistent shared files and bounded metadata. `tests/platform-repository.test.ts` verifies the existing migration/repository behavior alongside it.

The initial test setup exposed that the existing migration helper recognized only a line containing `END;`, while migration0004 has inline `BEGIN …; END;` bodies. The helper now recognizes a standalone closing END statement following a statement separator. This is a test harness correction; migration source and production application behavior are unchanged.

Primary reference: [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) (retrieved 2026-09-15), which documents atomic batched statements and primary reads without the Sessions API. Existing locked Workers types are retained under the repository release-age policy.

CLI consumption, content-addressed archive production and trusted controller publication are coordinated follow-up integration against these exact exports. No hosted registration, deployment, source credential change or paid inference is part of these local checks.
