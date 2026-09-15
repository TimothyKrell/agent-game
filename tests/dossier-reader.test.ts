import { describe, expect, it } from 'vitest';
import {
  DOSSIER_TRAVERSAL_THRESHOLD,
  dossierTraversalDirection,
} from '../src/client/dossier-navigation-intent';

describe('Succession document reader navigation', () => {
  it('keeps the one-pixel traversal threshold', () => {
    expect(DOSSIER_TRAVERSAL_THRESHOLD).toBe(1);
    expect(dossierTraversalDirection(20, 20.5)).toBeNull();
    expect(dossierTraversalDirection(20, 19)).toBe('earlier');
    expect(dossierTraversalDirection(20, 21)).toBe('later');
  });
});
