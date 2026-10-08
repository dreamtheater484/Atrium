import '@fontsource-variable/inter';
import './index.css';
import { Toaster, TooltipProvider } from '@atrium/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './lib/api';
import { queryClient } from './lib/queries';
import { ThemeProvider, useTheme } from './lib/theme';
import { router } from './router';

function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border-border !bg-surface !text-foreground !shadow-lg',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground',
        },
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        onChange={(theme) => void api('/me', { method: 'PATCH', body: { theme } }).catch(() => {})}
      >
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <ThemedToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
