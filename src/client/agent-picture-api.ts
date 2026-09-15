import { AgentPictureSchema } from '../shared/agent-picture';
import { decodeApiResponse } from './api-response';

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

  return decodeApiResponse(response, AgentPictureSchema, {
    unreadableMessage: 'The server returned an unreadable picture response.',
  });
}
