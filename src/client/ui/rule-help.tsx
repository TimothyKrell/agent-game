import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithRef, ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  createPopoverHandle,
} from './popover';

export type RuleHelp = {
  title: string;
  summary: string;
  description: string;
  icon: ReactNode;
};

type RuleHelpController = {
  handle: ReturnType<typeof createPopoverHandle<RuleHelp>>;
  detach: (id: string, fallback: HTMLElement | null) => void;
};

const RuleHelpContext = createContext<RuleHelpController | null>(null);

export type RuleHelpTriggerProps = ComponentPropsWithRef<'button'> & {
  help: RuleHelp;
  /** A surviving control to receive focus if this trigger is removed, e.g. its chapter heading. */
  fallbackFocus?: RefObject<HTMLElement | null>;
};

export function RuleHelpTrigger({
  help,
  fallbackFocus,
  id: providedId,
  className = '',
  ...props
}: RuleHelpTriggerProps) {
  const controller = useContext(RuleHelpContext);
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const fallback = useRef(fallbackFocus);
  fallback.current = fallbackFocus;

  useEffect(() => () => controller?.detach(id, fallback.current?.current ?? null), [controller, id]);

  if (!controller) throw new Error('RuleHelpTrigger requires RuleHelpProvider');

  return (
    <PopoverTrigger
      handle={controller.handle}
      id={id}
      payload={help}
      openOnHover
      delay={0}
      closeDelay={140}
      className={`replay-rule-trigger ${className}`}
      {...props}
    />
  );
}

/** One shared popup for a reading surface. Hover previews; press pins a focus-contained reference. */
export function RuleHelpProvider({ children }: { children: ReactNode }) {
  const [handle] = useState(() => createPopoverHandle<RuleHelp>());
  const [pinned, setPinned] = useState(false);
  const isOpen = useRef(false);
  const close = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement>(null);

  const controller = useMemo<RuleHelpController>(
    () => ({
      handle,
      detach: (id, fallback) => {
        // An outside chapter click may close the Popover before React removes its trigger.
        // Base UI still reads this ref during close; retarget it even when already closing.
        if (returnFocus.current?.id === id) {
          returnFocus.current = fallback;

          if (handle.isOpen) handle.close();
        }
      },
    }),
    [handle],
  );

  useEffect(() => {
    const scroll = (event: Event) => {
      const insideHelp = event.target instanceof Element && event.target.closest('.replay-rule-help');

      if (!pinned && !insideHelp) handle.close();
    };

    const visibility = () => {
      if (document.hidden) handle.close();
    };

    window.addEventListener('scroll', scroll, true);
    document.addEventListener('visibilitychange', visibility);

    return () => {
      window.removeEventListener('scroll', scroll, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [handle, pinned]);

  return (
    <RuleHelpContext.Provider value={controller}>
      {children}
      <Popover
        handle={handle}
        modal={pinned}
        onOpenChange={(open, details) => {
          if (isOpen.current && !pinned && !open && details.reason === 'trigger-press' && details.trigger) {
            // Base UI toggles a preview closed after its 500ms patient-click threshold.
            // Rule activation always pins it, including delayed clicks and Enter/Space.
            details.cancel();
            handle.open(details.trigger.id);

            return;
          }

          if (isOpen.current && pinned && details.reason === 'trigger-hover') {
            details.cancel();

            return;
          }

          isOpen.current = open;

          // Preserve the close control and modal semantics until Base UI finishes restoring focus.
          if (open) {
            if (details.trigger instanceof HTMLElement) returnFocus.current = details.trigger;
            setPinned(details.reason !== 'trigger-hover');
          }
        }}
      >
        {({ payload }) => (
          <PopoverContent
            className="replay-rule-help"
            backdrop={pinned}
            role={pinned ? 'dialog' : 'tooltip'}
            initialFocus={pinned ? close : false}
            // Preview dismissal preserves external focus; pinned mode survives through close.
            finalFocus={pinned ? returnFocus : false}
          >
            {payload && (
              <>
                {pinned && (
                  <PopoverClose
                    render={<Button variant="quiet" size="small" />}
                    ref={close}
                    className="replay-close"
                    aria-label="Close rules"
                  >
                    <X size={18} aria-hidden="true" />
                  </PopoverClose>
                )}
                <div className="replay-rule-heading">
                  <span className="tw:shrink-0" aria-hidden="true">
                    {payload.icon}
                  </span>
                  <PopoverTitle>{payload.title}</PopoverTitle>
                </div>
                <strong>{payload.summary}</strong>
                <PopoverDescription>{payload.description}</PopoverDescription>
                <small>{pinned ? 'Rule reference' : 'Click to keep open'}</small>
              </>
            )}
          </PopoverContent>
        )}
      </Popover>
    </RuleHelpContext.Provider>
  );
}
