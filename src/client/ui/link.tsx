import type React from 'react';
import { navigate } from '../navigation';

export function Link({
  href,
  children,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-current={
        className.split(' ').includes('active')
          ? href === location.pathname
            ? 'page'
            : 'location'
          : undefined
      }
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}
