/** Illustrative owner-picture previews only. Real profile storage/upload belongs to production integration. */
import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const names = [
  'Velvet',
  'Patch',
  'Spark',
  'Echo',
  'Cipher',
  'Axiom',
  'Katniss Everdeen',
  'Orbit',
  'Flux',
  'Quill',
  'Vesper',
];

const colors = [
  '#bd91b3',
  '#80c9bd',
  '#edb471',
  '#94b6d5',
  '#91b294',
  '#ccbf89',
  '#b5c088',
  '#86bcbf',
  '#b49ad5',
  '#cca18c',
];

function portrait(index: number) {
  const color = colors[index % colors.length];

  const eyes = [
    '<path d="m49 57 6-4 6 4m7 0 6-4 6 4"/>',
    '<path d="M49 53h10v7H49Zm20 0h10v7H69Z"/>',
    '<circle cx="54" cy="56" r="4"/><circle cx="74" cy="56" r="4"/>',
  ][index % 3];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#14292d"/><path d="M8 24V8h16m80 0h16v16M8 104v16h16m80 0h16v-16" fill="none" stroke="${color}" opacity=".5"/><circle cx="64" cy="60" r="44" fill="${color}" opacity=".12"/><path d="M22 128v-22l18-15h48l18 15v22" fill="${color}" opacity=".65"/><path d="M55 82v14l9 9 9-9V82" fill="#14292d" stroke="${color}" stroke-width="3"/><path d="M35 35h58v36L79 85H49L35 71Z" fill="#203b40" stroke="${color}" stroke-width="3"/><path d="M43 43h42v25l-9 9H52l-9-9Z" fill="${color}" opacity=".15"/><g fill="none" stroke="${color}" stroke-width="3">${eyes}<path d="M54 69h20M64 35V22m-4-4h8v5h-8Z"/></g><path d="M27 48h8v18h-8m66-18h8v18h-8" fill="${color}"/><path d="M37 111h54" stroke="#14292d" stroke-width="3"/></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const fallback = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#14292d"/><g fill="none" stroke="#8daaa3" stroke-width="3"><path d="M16 32V16h16m64 0h16v16M16 96v16h16m64 0h16V96"/><circle cx="64" cy="47" r="19"/><path d="M30 106V93c0-27 68-27 68 0v13"/></g></svg>')}`;

const portraits = new Map(names.map((name, index) => [name, name === 'Vesper' ? fallback : portrait(index)]));

const namePattern = new RegExp(`\\b(${[...names].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');

const PictureContext = createContext((_name: string, _trigger: HTMLButtonElement) => {});

export function AgentPortrait({ name, large = false }: { name: string; large?: boolean }) {
  const show = useContext(PictureContext);

  return (
    <button
      type="button"
      className={`dp-avatar ${large ? 'dp-avatar-large' : ''}`}
      aria-label={`View ${name} profile picture`}
      aria-haspopup="dialog"
      onClick={(event) => show(name, event.currentTarget)}
    >
      <img src={portraits.get(name) ?? fallback} alt="" width="128" height="128" />
    </button>
  );
}

export function AgentName({ name }: { name: string }) {
  if (!portraits.has(name)) return name;

  return (
    <span className="dp-agent-name">
      <AgentPortrait name={name} />
      <span>{name}</span>
    </span>
  );
}

export function AgentText({ text }: { text: string }) {
  return text
    .split(namePattern)
    .map((part, index) => (portraits.has(part) ? <AgentName key={index} name={part} /> : part));
}

function PictureDialog({ name, close }: { name: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    dialog.current?.showModal();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      className="dp-picture-dialog"
      aria-labelledby="dp-picture-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();

        if (
          event.target === event.currentTarget &&
          (event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom)
        )
          close();
      }}
    >
      <button autoFocus className="dp-help-close" aria-label="Close profile picture" onClick={close}>
        <X size={18} />
      </button>
      <img
        src={portraits.get(name) ?? fallback}
        alt={`${name} ${name === 'Vesper' ? 'default' : 'illustrative'} profile picture`}
        width="320"
        height="320"
      />
      <h2 id="dp-picture-title">{name}</h2>
      <p>
        {name === 'Vesper'
          ? 'No profile picture yet · default avatar'
          : 'Illustrative portrait · design preview'}
      </p>
      <small>Agents will use an owner-supplied picture or one they create with their own tools.</small>
    </dialog>,
    document.body,
  );
}

export function AgentPictureProvider({ children }: { children: ReactNode }) {
  const [picture, setPicture] = useState<{ name: string; trigger: HTMLButtonElement } | null>(null);

  return (
    <PictureContext.Provider value={(name, trigger) => setPicture({ name, trigger })}>
      {children}
      {picture && (
        <PictureDialog
          name={picture.name}
          close={() => {
            setPicture(null);
            requestAnimationFrame(() => picture.trigger.focus({ preventScroll: true }));
          }}
        />
      )}
    </PictureContext.Provider>
  );
}
