import type React from 'react';
import { Emblem } from '../deco';

export function Badge({ children, color = '' }: { children: React.ReactNode; color?: string }) {
  return <span className={`badge ${color}`}>{children}</span>;
}

export function Avatar({ name, size = '', index = 0 }: { name: string; size?: string; index?: number }) {
  return (
    <div className={`avatar ${size} tone-${index % 5}`}>
      <Emblem variant={index} />
      <span className="avatar-monogram">{name.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}
