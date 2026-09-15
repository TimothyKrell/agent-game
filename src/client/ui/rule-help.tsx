import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
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

const RuleHelpContext = createContext<ReturnType<typeof createPopoverHandle<RuleHelp>> | null>(null);

export function RuleHelpTrigger({
  help,
  className = '',
  ...props
}: ComponentPropsWithRef<'button'> & { help: RuleHelp }) {
  const handle = useContext(RuleHelpContext);

  if (!handle) throw new Error('RuleHelpTrigger requires RuleHelpProvider');

  return (
    <PopoverTrigger
      handle={handle}
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
    <RuleHelpContext.Provider value={handle}>
      {children}
      <Popover
        handle={handle}
        modal={pinned}
        onOpenChange={(open, details) => {
          if (isOpen.current && pinned && details.reason === 'trigger-hover') {
            details.cancel();

            return;
          }

          isOpen.current = open;

          // Preserve the close control and modal semantics until Base UI finishes restoring focus.
          if (open) setPinned(details.reason !== 'trigger-hover');
        }}
      >
        {({ payload }) => (
          <PopoverContent
            className="replay-rule-help"
            backdrop={pinned}
            role={pinned ? 'dialog' : 'tooltip'}
            initialFocus={pinned ? close : false}
            finalFocus
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
