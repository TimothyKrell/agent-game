import { useId, useRef, useState } from 'react';
import type { AgentProfile } from '../shared/api';
import {
  AgentPictureSchema,
  missingAgentPicture,
  PICTURE_MAX_BYTES,
  type AgentPicture,
} from '../shared/agent-picture';
import { changePicture, type PictureChange } from './agent-picture-api';
import { api, ApiError } from './api';

type PictureMetadata =
  { state: 'initial' } | { state: 'required' } | { state: 'loaded'; picture: AgentPicture };

export function OwnerAgentPicture({ agent, refresh }: { agent: AgentProfile; refresh: () => Promise<void> }) {
  const helpId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<PictureMetadata>({ state: 'initial' });
  const [retry, setRetry] = useState<PictureChange | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const profilePicture = agent.picture ?? missingAgentPicture;

  const picture =
    metadata.state === 'loaded' && metadata.picture.revision > profilePicture.revision
      ? metadata.picture
      : profilePicture;

  const needsMetadata = metadata.state === 'required';

  async function reconcilePicture() {
    setPending(true);
    setMetadata({ state: 'required' });
    setError('');
    setStatus('Picture change confirmed. Refreshing current picture…');
    let current: AgentPicture;

    try {
      // A receipt can describe an older successful operation. Only a current, result-bearing read
      // can supply display metadata; the dashboard's useLoad refresh catches its own failures.
      current = await api(`/api/agents/${encodeURIComponent(agent.id)}/picture`, AgentPictureSchema);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The current picture could not be loaded.');
      setStatus('Picture change confirmed. Current picture is unavailable until refreshed.');
      setPending(false);

      return;
    }

    setMetadata({ state: 'loaded', picture: current });
    setStatus(current.state === 'present' ? 'Picture saved.' : 'Picture removed.');

    try {
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The roster could not be refreshed.');
    } finally {
      setPending(false);
    }
  }

  async function submit(change: PictureChange) {
    if (pending || needsMetadata) return;
    setPending(true);
    setError('');
    setStatus('Saving picture…');

    try {
      await changePicture(agent.id, change);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The picture could not be saved.');
      setStatus('');
      const conflict = cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
      setRetry(conflict ? null : change);

      try {
        if (conflict) await refresh();
      } finally {
        setPending(false);
      }

      return;
    }

    // Confirmation retires the mutation retry permanently. Metadata recovery never resends it.
    setRetry(null);
    setFile(null);

    if (input.current) input.current.value = '';
    await reconcilePicture();
  }

  const change = (next: File | null) =>
    submit({ requestId: crypto.randomUUID(), revision: picture.revision, file: next });

  return (
    <details className="roster-setup" aria-label={`Picture for ${agent.name}`}>
      <summary>
        Profile picture ·{' '}
        {needsMetadata ? 'Refresh needed' : picture.state === 'present' ? 'Uploaded' : 'Optional'}
      </summary>
      <div aria-busy={pending}>
        {needsMetadata ? (
          <p>Refresh metadata to see the current picture.</p>
        ) : picture.state === 'present' ? (
          <a
            href={picture.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Enlarge ${agent.name}’s picture (opens in a new tab)`}
          >
            <img
              src={picture.url}
              alt={`${agent.name}’s profile picture`}
              width={96}
              height={96}
              style={{ objectFit: 'contain' }}
            />
          </a>
        ) : (
          <p>No picture uploaded.</p>
        )}
        <p id={helpId}>
          Optional. PNG or JPEG, up to 2 MiB and 2048 × 2048 pixels. Your agent can play with or without a
          picture.
        </p>
        {!agent.retired && (
          <label>
            {picture.state === 'present' ? 'Choose a replacement picture' : 'Choose a picture'}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              disabled={pending || needsMetadata}
              aria-describedby={helpId}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setRetry(null);
                setStatus('');
                const tooLarge = selected && selected.size > PICTURE_MAX_BYTES;
                setError(tooLarge ? 'Pictures must be at most 2 MiB.' : '');
                setFile(tooLarge ? null : selected);
              }}
            />
          </label>
        )}
        <div className="hero-actions">
          {!agent.retired && (
            <button
              className="button ghost small"
              type="button"
              disabled={pending || needsMetadata || !file || !!retry}
              onClick={() => change(file)}
            >
              {picture.state === 'present' ? 'Replace picture' : 'Upload picture'}
            </button>
          )}
          {!needsMetadata && picture.state === 'present' && (
            <button
              className="button ghost small"
              type="button"
              disabled={pending || !!retry}
              onClick={() => change(null)}
            >
              Remove picture
            </button>
          )}
          {retry && (
            <button
              className="button ghost small"
              type="button"
              disabled={pending}
              onClick={() => submit(retry)}
            >
              Retry picture change
            </button>
          )}
          {needsMetadata && (
            <button
              className="button ghost small"
              type="button"
              disabled={pending}
              onClick={reconcilePicture}
            >
              Retry picture metadata
            </button>
          )}
        </div>
        {agent.retired && <p>This agent is retired. Its current picture can still be removed.</p>}
        {error && <p role="alert">{error}</p>}
        <p role="status">{status}</p>
      </div>
    </details>
  );
}
