import { Option, Schema } from 'effect';
import { ErrorResponseSchema } from '../shared/api';
import { AgentPictureSchema } from '../shared/agent-picture';
import { ApiError } from './api';

export interface PictureChange {
  requestId: string;
  revision: number;
  file: File | null;
}

export async function changePicture(agentId: string, change: PictureChange) {
  const headers = new Headers({
    'If-Match': `"${change.revision}"`,
    'Idempotency-Key': change.requestId,
  });

  if (change.file) headers.set('Content-Type', change.file.type);

  const response = await fetch(`/api/owner/agents/${encodeURIComponent(agentId)}/picture`, {
    method: change.file ? 'PUT' : 'DELETE',
    credentials: 'same-origin',
    headers,
    body: change.file,
  });

  const value: unknown = await response.json();

  if (!response.ok) {
    const decoded = Schema.decodeUnknownOption(ErrorResponseSchema)(value);
    const problem = Option.getOrNull(decoded)?.error;

    throw new ApiError(problem?.message ?? 'The picture could not be saved.', problem?.code, response.status);
  }

  const decoded = Schema.decodeUnknownOption(AgentPictureSchema)(value);

  if (Option.isNone(decoded))
    throw new ApiError('The server returned an unreadable picture response.', undefined, 502);

  return decoded.value;
}
