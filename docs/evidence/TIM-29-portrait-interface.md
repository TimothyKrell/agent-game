# TIM-29 · Shared portrait consumer interface

`src/client/agent-portrait.tsx` exports `AgentPortrait` and `AgentPortraitProps`:

```tsx
import { AgentPortrait } from './agent-portrait';

<span className="replay-ui">
  <AgentPortrait
    agentId={originalEntrant.agentId}
    name={originalEntrant.name}
    picture={pictures.get(originalEntrant.agentId)}
    onImageError={revalidateUnavailable}
  />
</span>;
```

Props: `{ agentId?: string; name: string; picture?: AgentPicture; size?: number; onImageError?: () => void; className?: string }`.

- `name` is the accessible original entrant/profile name. Supply the stable original entrant ID even after a house takeover. `agentId` is optional for genuinely unknown identity; it is never used to perform a lookup.
- `picture` is current optional metadata from a profile/list response or TIM-29's bounded roster batch. Omission and `state: 'missing'` both use the shared fallback. No per-row metadata request occurs. Broken delivery/decode falls back independently. A different current version URL is retried naturally.
- Pass `useAgentPictures(...).revalidateUnavailable` as `onImageError`. Both thumbnail and enlarged-image delivery/decode failures invoke it after selecting the fallback. The hook owns the single extra whole-roster read budget shared by every image; the portrait has no separate retry/fetch loop.
- The component owns one shared Base UI Dialog with keyboard activation, contained focus, Escape/close and exact trigger restoration. It requires neither `RuleHelpProvider` nor a Dossier model/provider. Do not nest the portrait button inside another link/button; place the separate profile-name link beside or below it.
- `agent-portrait.css` is manifest-imported in the `components` layer. The consumer must supply a `.replay-ui` ancestor (as small as the wrapper above). Base UI supplies `.replay-ui-portal` for enlargement. No consumer global CSS or extra overlay is needed.
- Default box size uses `--replay-portrait-size`: **88px desktop / 64px at ≤760px** from the existing scoped tokens. Optional `size={32}` sets a fixed square box in CSS pixels. A consumer-specific wrapper or `className` may instead override the variable locally for responsive compact profile/list use. The image remains square, cropped with `object-fit: cover`; enlargement shows the full image using the existing `replay-portrait-dialog` primitive styles.
- The Dossier adapter delegates to this exact component, passing `className="dossier-portrait"`. TIM-29 should import `AgentPortrait` directly. The actual Dossier route now consumes `useAgentPictures` from `ee945f5`, with one shared `revalidateUnavailable` callback passed through its portrait-map provider.

Dependencies: existing TIM-11 Dialog/semantic tokens, React, Lucide and TIM-28 `AgentPicture`. No new packages, backend, inference or image generation. This extraction preserves the graphics/enlargement exercised by the Dossier browser suite (missing, valid, broken, changed URL, stable entrant identity, accessible dialog and restored focus).
