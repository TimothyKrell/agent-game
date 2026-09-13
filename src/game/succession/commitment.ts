import { randomIndex, shuffle } from '../random';
import type { RandomContext } from './types';

export const secureRandom: RandomContext = { random: randomIndex, id: () => crypto.randomUUID() };

export async function commitmentDigest(
  matchId: string,
  saltBase64url: string,
  priority: number[],
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify(['succession-tie-v1', matchId, 'succession-1', saltBase64url, priority]),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function createCommitment(
  matchId: string,
  random = secureRandom,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(32)),
) {
  if (salt.length !== 32) throw new Error('Tie commitment requires a 32-byte salt.');
  const priority = shuffle(
    Array.from({ length: 10 }, (_, seat) => seat),
    random.random,
  );
  const saltBase64url = btoa(String.fromCharCode(...salt))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return { priority, saltBase64url, digest: await commitmentDigest(matchId, saltBase64url, priority) };
}
export async function verifyCommitment(
  matchId: string,
  value: { digest: string; saltBase64url: string; priority: number[] },
): Promise<boolean> {
  return (
    /^[A-Za-z0-9_-]{43}$/.test(value.saltBase64url) &&
    value.priority.length === 10 &&
    new Set(value.priority).size === 10 &&
    value.priority.every((seat) => Number.isInteger(seat) && seat >= 0 && seat < 10) &&
    value.digest === (await commitmentDigest(matchId, value.saltBase64url, value.priority))
  );
}
