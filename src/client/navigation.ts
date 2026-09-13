import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('app:navigate', listener);

  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('app:navigate', listener);
  };
}

export function useLocation() {
  return useSyncExternalStore(subscribe, () => location.href);
}

export function navigate(path: string, { scroll = true } = {}) {
  if (new URL(path, location.origin).href === location.href) return;
  history.pushState({}, '', path);
  window.dispatchEvent(new Event('app:navigate'));

  if (scroll) window.scrollTo(0, 0);
}
