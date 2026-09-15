import { useRef } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;

export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogClose = DialogPrimitive.Close;

export const DialogTitle = DialogPrimitive.Title;

export const DialogDescription = DialogPrimitive.Description;

export const createDialogHandle = DialogPrimitive.createHandle;

export type DialogContentProps = Omit<DialogPrimitive.Popup.Props, 'className'> & {
  className?: string;
  closeLabel?: string;
};

/** Title and Description are composed by the caller; the close control is always available. */
export function DialogContent({
  className = '',
  children,
  closeLabel = 'Close',
  initialFocus,
  ...props
}: DialogContentProps) {
  const close = useRef<HTMLButtonElement>(null);

  return (
    <DialogPrimitive.Portal className="replay-ui-portal">
      <DialogPrimitive.Backdrop className="replay-dialog-backdrop" />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={`replay-dialog ${className}`}
        initialFocus={initialFocus ?? close}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          render={<Button variant="quiet" size="small" />}
          ref={close}
          className="replay-close"
          aria-label={closeLabel}
        >
          <X size={18} aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
