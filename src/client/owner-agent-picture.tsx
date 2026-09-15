import { useId, useRef, useState } from 'react';
import type { AgentProfile } from '../shared/api';
import { missingAgentPicture, PICTURE_MAX_BYTES, type AgentPicture } from '../shared/agent-picture';
import { changePicture, type PictureChange } from './agent-picture-api';
import { ApiError } from './api';

export function OwnerAgentPicture({ agent, refresh }: { agent: AgentProfile; refresh: () => Promise<void> }) {
  const helpId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<AgentPicture | null>(null);
  const [retry, setRetry] = useState<PictureChange | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const profilePicture = agent.picture ?? missingAgentPicture;
  const picture = saved && saved.revision > profilePicture.revision ? saved : profilePicture;

  async function submit(change: PictureChange) {
    if (pending) return;
    setPending(true);
    setError('');
    setStatus('Saving picture…');

    try {
      const result = await changePicture(agent.id, change);
      setSaved(result);
      setRetry(null);
      setFile(null);

      if (input.current) input.current.value = '';
      setStatus(result.state === 'present' ? 'Picture saved.' : 'Picture removed.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The picture could not be saved.');
      setStatus('');
      const conflict = cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
      setRetry(conflict ? null : change);

      if (conflict) await refresh();
    } finally {
      setPending(false);
    }
  }

  const change = (next: File | null) =>
    submit({ requestId: crypto.randomUUID(), revision: picture.revision, file: next });

  return (
    <details className="roster-setup" aria-label={`Picture for ${agent.name}`}>
      <summary>Profile picture · {picture.state === 'present' ? 'Uploaded' : 'Optional'}</summary>
      <div aria-busy={pending}>
        {picture.state === 'present' ? (
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
              disabled={pending}
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
              disabled={pending || !file || !!retry}
              onClick={() => change(file)}
            >
              {picture.state === 'present' ? 'Replace picture' : 'Upload picture'}
            </button>
          )}
          {picture.state === 'present' && (
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
        </div>
        {agent.retired && <p>This agent is retired. Its current picture can still be removed.</p>}
        {error && <p role="alert">{error}</p>}
        <p role="status">{status}</p>
      </div>
    </details>
  );
}
