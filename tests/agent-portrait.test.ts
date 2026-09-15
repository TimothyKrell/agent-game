import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentPortrait, agentPortraitColor } from '../src/client/agent-portrait';

describe('AgentPortrait fallback', () => {
  it('keys fallback color to stable entrant identity rather than the current name', () => {
    expect(agentPortraitColor('entrant-7')).toBe(agentPortraitColor('entrant-7'));
    expect(agentPortraitColor('entrant-7')).not.toBe(agentPortraitColor('entrant-8'));
    expect(
      renderToStaticMarkup(createElement(AgentPortrait, { agentId: 'entrant-7', name: 'First name' })),
    ).toContain(agentPortraitColor('entrant-7'));
    expect(
      renderToStaticMarkup(createElement(AgentPortrait, { agentId: 'entrant-7', name: 'Renamed' })),
    ).toContain(agentPortraitColor('entrant-7'));
  });

  it('renders the robot fallback only when an uploaded picture is absent', () => {
    const fallback = renderToStaticMarkup(
      createElement(AgentPortrait, { agentId: 'entrant-2', name: 'Fallback' }),
    );

    const uploaded = renderToStaticMarkup(
      createElement(AgentPortrait, {
        agentId: 'entrant-2',
        name: 'Uploaded',
        picture: {
          state: 'present',
          revision: 1,
          version: 'picture-v1',
          url: 'https://example.com/picture.png',
          contentType: 'image/png',
          width: 128,
          height: 128,
          bytes: 1024,
        },
      }),
    );

    expect(fallback).toContain('data-portrait-fallback="robot"');
    expect(fallback).toContain('portrait-robot-head');
    expect(uploaded).toContain('https://example.com/picture.png');
    expect(uploaded).not.toContain('data-portrait-fallback');
    expect(uploaded).not.toContain('portrait-robot-head');
  });
});
