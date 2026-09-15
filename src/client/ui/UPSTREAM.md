# Replay primitives · source ownership

The selected starting point is **shadcn `base-nova`**, retrieved from the first-party registry on **2026-09-14**, using the parent-locked **`@base-ui/react` 1.8.0** APIs. This directory is maintained source, not generated output. [MIT license](LICENSE.md).

| Local module      | Registry starting source                                    | Adaptation                                                                                                                                          |
| ----------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button.tsx`      | <https://ui.shadcn.com/r/styles/base-nova/button.json>      | Native React 19 button/ref props; three variants/two sizes, source-owned CSS instead of cva/cn. No polymorphic navigation.                          |
| `collapsible.tsx` | <https://ui.shadcn.com/r/styles/base-nova/collapsible.json> | Root/Trigger/Panel composition; require owner-controlled open state. No height animation/clipping.                                                  |
| `dialog.tsx`      | <https://ui.shadcn.com/r/styles/base-nova/dialog.json>      | Root, Trigger, Portal, Backdrop, Popup, Close, Title, Description. Always include named close; focus defaults to it. Selected content wrapper only. |
| `popover.tsx`     | <https://ui.shadcn.com/r/styles/base-nova/popover.json>     | Portal/Positioner/Popup with 12px collision padding, title/description and optional pinned backdrop.                                                |
| `rule-help.tsx`   | Local composition of the selected Popover                   | One detached-trigger handle per provider, typed rule payload, hover preview and click/tap/keyboard pinning. No separate tooltip stack.              |

The four exact registry responses and their SHA-256 hashes are preserved in [the evidence snapshot](../../../docs/evidence/TIM-11-foundations/upstream/sources.json). No claim is made that the moving registry URL is an immutable Git revision. `@base-ui/react` ships its own MIT license in the installed package.

Locked `.d.ts` and implementation inspection covered `Popover.Trigger.openOnHover/delay/closeDelay`, `Root.modal/onOpenChange/createHandle`, `Popup.initialFocus/finalFocus`, `Positioner.collisionPadding`, `Dialog` focus and detached triggers, and `Collapsible.Panel`. [Base UI Popover](https://base-ui.com/react/components/popover), [Dialog](https://base-ui.com/react/components/dialog), [Collapsible](https://base-ui.com/react/components/collapsible).

No generator, alias migration, global reset, animation stylesheet, default shadcn palette, or cn/cva dependency is needed by these selected modules. The `client.css` manifest imports the source-owned styles. [Public API, token contract and verified behavior](../../../docs/evidence/TIM-11-foundations.md).
