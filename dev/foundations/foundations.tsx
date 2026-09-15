/** Real production primitives, local interaction fixtures. Vite-only, outside the build entry graph. */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen } from 'lucide-react';
import { Button } from '../../src/client/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../src/client/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../src/client/ui/dialog';
import { RuleHelpProvider, RuleHelpTrigger } from '../../src/client/ui/rule-help';
import '../../src/client/client.css';

function Foundations() {
  const [open, setOpen] = useState(true);
  const [submissions, setSubmissions] = useState(0);
  const focus = useRef<HTMLButtonElement>(null);
  const [rulesOpen, setRulesOpen] = useState(true);
  const chapterControl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const collapse = () => setRulesOpen(false);
    window.addEventListener('tim11-collapse', collapse);

    return () => window.removeEventListener('tim11-collapse', collapse);
  }, []);

  return (
    <main className="replay-ui" style={{ margin: '24px auto', maxWidth: 700 }}>
      <h1>Reading controls</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmissions((value) => value + 1);
        }}
      >
        <Button ref={focus} variant="primary">
          Default button
        </Button>
        <Button type="submit">Save reading preference</Button>
        <Button disabled onClick={() => setSubmissions(99)}>
          Unavailable
        </Button>
        <Button size="small" variant="quiet" onClick={() => focus.current?.focus()}>
          Focus first control
        </Button>
        <output aria-label="Saved preferences">{submissions}</output>
      </form>
      <Collapsible open={open} onOpenChange={setOpen}>
        <h2>
          <CollapsibleTrigger render={<Button />}>Act I · faction result</CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <p>The match continues. All ten agents return for Act II.</p>
          <Button size="small">Read starting resources</Button>
        </CollapsibleContent>
      </Collapsible>
      <RuleHelpProvider>
        <p>
          <RuleHelpTrigger
            help={{
              title: 'Executor',
              summary: 'Choose which of two policies becomes law.',
              description: 'An elected office. The Coordinator performs executions. '.repeat(16),
              icon: <BookOpen />,
            }}
          >
            <BookOpen aria-hidden="true" /> Executor rules
          </RuleHelpTrigger>
        </p>
      </RuleHelpProvider>
      <Dialog>
        <DialogTrigger render={<Button />}>View long identity</DialogTrigger>
        <DialogContent closeLabel="Close identity">
          <DialogTitle>{'A'.repeat(80)}</DialogTitle>
          <DialogDescription>A long identity remains readable at narrow widths and zoom.</DialogDescription>
          <a href="#identity-detail">Agent profile</a>
          <Dialog>
            <DialogTrigger render={<Button />}>View portrait detail</DialogTrigger>
            <DialogContent>
              <DialogTitle>Portrait detail</DialogTitle>
              <DialogDescription>Nested focus returns to its own trigger.</DialogDescription>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
      <RuleHelpProvider>
        <Button onClick={() => setRulesOpen(false)}>Collapse chapter externally</Button>
        <RuleHelpTrigger
          help={{
            title: 'Coins',
            summary: 'Pay for actions.',
            description: 'Costs are not refunded.',
            icon: <BookOpen />,
          }}
        >
          Persistent coins rules
        </RuleHelpTrigger>
        <Collapsible open={rulesOpen} onOpenChange={setRulesOpen}>
          <CollapsibleTrigger ref={chapterControl} render={<Button />}>
            Rules chapter
          </CollapsibleTrigger>
          <CollapsibleContent>
            {rulesOpen && (
              <RuleHelpTrigger
                fallbackFocus={chapterControl}
                help={{
                  title: 'Treasurer',
                  summary: 'Claim to gain three coins.',
                  description: 'A claim may be challenged.',
                  icon: <BookOpen />,
                }}
              >
                Treasurer rules
              </RuleHelpTrigger>
            )}
          </CollapsibleContent>
        </Collapsible>
      </RuleHelpProvider>
      <label>
        Reading note
        <input id="reading-note" />
      </label>
      <div role="region" aria-label="Independent scroll area" style={{ height: 60, overflow: 'auto' }}>
        <p style={{ height: 160 }}>Scrollable notes outside the rule help.</p>
      </div>
    </main>
  );
}

const root = document.getElementById('root');

if (root) createRoot(root).render(<Foundations />);
