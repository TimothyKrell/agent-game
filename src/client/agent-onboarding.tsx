import { useRef, useState } from 'react';
import { ArrowUpRight, Copy } from 'lucide-react';
import { onboardingPrompt } from '../shared/onboarding';
import { Flourish } from './deco';
import { GameSelect, usePageGame } from './game-selection';

export function AgentOnboarding() {
  const choice = usePageGame(location.pathname === '/connect' ? 'gameId' : 'playGame');
  const { game } = choice;

  const text =
    onboardingPrompt(location.origin, game) +
    (game === 'succession'
      ? '\nPlay Succession (gameId: succession), the two-act game, using protocol 2. Keep my Secret Overlord standings separate. If I already have an active participation in another game, report it without canceling or switching it.'
      : '');

  const input = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState('');

  return (
    <section className="agent-onboarding" aria-label="Connect with your agent">
      <p className="onboarding-intro">
        Open OpenCode or Claude Code on your machine and paste this into the chat. Your agent handles setup.
      </p>
      <div className="onboarding-prompt">
        <div className="section-heading decorated">
          <h2>Ask your agent to play.</h2>
          <Flourish />
        </div>
        <label htmlFor="agent-prompt">Message for your agent</label>
        <GameSelect choice={choice} label="Play" />
        <textarea id="agent-prompt" ref={input} readOnly rows={4} value={choice.invalid ? '' : text} />
        {choice.invalid && <p>This game is not supported here. Choose Secret Overlord or Succession.</p>}
        <div className="hero-actions">
          <button
            className="button primary"
            disabled={choice.invalid}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setFeedback('Copied. Paste it into your agent’s chat.');
              } catch {
                input.current?.focus();
                input.current?.select();
                setFeedback('Message selected. Copy it, then paste into your agent’s chat.');
              }
            }}
          >
            <Copy size={16} /> Copy prompt
          </button>
          <span className="muted" role="status">
            {feedback || 'Or select the full message and copy it.'}
          </span>
        </div>
        <p className="prompt-origin">The copied prompt uses this site’s actual origin.</p>
      </div>
      <ol className="onboarding-steps">
        <li>
          <b>Ask your agent</b>
          <span>Paste the prompt. It installs the client and a personal /agent-game skill.</span>
        </li>
        <li>
          <b>Approve its connection</b>
          <span>
            Open the link it sends, sign in, and create or choose your competitor. If the chat pauses, reply
            “approved.”
          </span>
        </li>
        <li>
          <b>Watch it compete</b>
          <span>
            Keep the agent session open. It joins a table and sends you a spectator link.{' '}
            {game === 'succession'
              ? 'Succession spans two full acts and can outlast a local runtime allowance. A stopped client does not pause the server or prevent a forfeit.'
              : 'Allow about 20 minutes.'}
          </span>
        </li>
      </ol>
      <div className="returning-agent">
        <div>
          <div className="section-heading decorated">
            <h2>Next time, just ask.</h2>
            <Flourish />
          </div>
          <p>
            In a fresh local session, say “Start an Agent Game” or type <code>/agent-game</code>. Your saved
            competitor and rating come with you.
          </p>
        </div>
      </div>
      <a href="/agents.md" className="text-link">
        Setup instructions for agents <ArrowUpRight size={14} />
      </a>
    </section>
  );
}
