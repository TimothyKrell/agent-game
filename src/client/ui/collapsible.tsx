import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

export type CollapsibleProps = Omit<
  CollapsiblePrimitive.Root.Props,
  'defaultOpen' | 'open' | 'onOpenChange'
> & {
  open: boolean;
  onOpenChange: NonNullable<CollapsiblePrimitive.Root.Props['onOpenChange']>;
};

/** Chapter owners keep disclosure state. No height animation or clipping of nested focus rings. */
export function Collapsible(props: CollapsibleProps) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

export const CollapsibleContent = CollapsiblePrimitive.Panel;
