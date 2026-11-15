import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { queryClient } from '@/app/query-client';
import { router } from '@/routes/router';
import { PreferencesSync } from '@/features/preferences/PreferencesSync';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesSync />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
