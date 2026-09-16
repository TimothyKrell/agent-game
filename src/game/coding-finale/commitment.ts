import { randomIndex, shuffle } from '../random';

export interface FinaleCommitment {
  priority: number[];
  saltBase64url: string;
  digest: string;
}

export async function finaleCommitmentDigest(id: string, saltBase64url: string, priority: number[]) {
  const material = JSON.stringify(['coding-finale-tie-v1', id, saltBase64url, priority]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createFinaleCommitment(id: string): Promise<FinaleCommitment> {
  const priority = shuffle(
    Array.from({ length: 10 }, (_, seat) => seat),
    randomIndex,
  );

  const saltBase64url = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  return { priority, saltBase64url, digest: await finaleCommitmentDigest(id, saltBase64url, priority) };
}
