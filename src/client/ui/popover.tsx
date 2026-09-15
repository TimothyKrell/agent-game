import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

export const Popover = PopoverPrimitive.Root;

export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverClose = PopoverPrimitive.Close;

export const PopoverTitle = PopoverPrimitive.Title;

export const PopoverDescription = PopoverPrimitive.Description;

export const createPopoverHandle = PopoverPrimitive.createHandle;

export type PopoverContentProps = Omit<PopoverPrimitive.Popup.Props, 'className'> &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    className?: string;
    backdrop?: boolean;
  };

export function PopoverContent({
  className = '',
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 8,
  backdrop = false,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal className="replay-ui-portal">
      {backdrop && <PopoverPrimitive.Backdrop className="replay-popover-backdrop" />}
      <PopoverPrimitive.Positioner
        className="replay-popover-positioner"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={12}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={`replay-popover ${className}`}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
