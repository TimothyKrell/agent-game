/** Rejection sampling avoids modulo bias; production randomness stays server-owned. */
export function randomIndex(size: number): number {
  if (!Number.isInteger(size) || size < 1) throw new Error('Invalid random range');
  const ceiling = Math.floor(0x1_0000_0000 / size) * size;
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= ceiling);

  return value[0] % size;
}

export function shuffle<T>(values: readonly T[], random: (size: number) => number = randomIndex): T[] {
  const result = [...values];

  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
