/** Minimal real Collapsible / shared RuleHelp composition. Dev-only regression entry. */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../src/client/ui/collapsible';
import { RuleHelpProvider, RuleHelpTrigger } from '../../../src/client/ui/rule-help';
import '../../../src/client/client.css';

function FocusFixture() {
  const [open, setOpen] = useState(true);
  const heading = useRef<HTMLButtonElement>(null);
  const owner = useRef<HTMLButtonElement>(null);
  const note = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState(true);
  const native = new URLSearchParams(location.search).has('native');
  const removingProvider = new URLSearchParams(location.search).has('provider-removal');

  const rule = (
    <RuleHelpTrigger
      fallbackFocus={removingProvider ? owner : heading}
      help={{
        title: 'Coins',
        summary: 'Pay for actions.',
        description: 'Costs are not refunded.',
        icon: null,
      }}
    >
      Coins rules
    </RuleHelpTrigger>
  );

  useEffect(() => {
    const remove = () => {
      // A route owner removes its reading surface and focuses a surviving visible input once.
      flushSync(() => setProvider(false));
      note.current?.focus();
    };

    window.addEventListener('remove-rule-provider', remove);

    return () => window.removeEventListener('remove-rule-provider', remove);
  }, []);

  return (
    <main className="replay-ui" style={{ padding: 40 }}>
      {removingProvider && (
        <>
          <label>
            External note
            <input ref={note} />
          </label>
          <button ref={owner}>Provider owner control</button>
        </>
      )}
      {provider && (
        <RuleHelpProvider>
          {native ? (
            <>
              <button ref={heading} onClick={() => setOpen(!open)}>
                Rules chapter
              </button>
              {open && rule}
            </>
          ) : (
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger ref={heading}>Rules chapter</CollapsibleTrigger>
              <CollapsibleContent>{open && rule}</CollapsibleContent>
            </Collapsible>
          )}
        </RuleHelpProvider>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<FocusFixture />);
