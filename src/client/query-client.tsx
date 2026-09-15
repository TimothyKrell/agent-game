import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function ClientQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
            networkMode: 'online',
            throwOnError: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: { retry: false, gcTime: 0, networkMode: 'always' },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
