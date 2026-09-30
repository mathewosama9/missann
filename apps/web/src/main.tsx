import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Notifier } from './components/ui/notify';
import { router } from './routes/router';
import { queryClient } from './lib/query';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Notifier />
    </QueryClientProvider>
  </React.StrictMode>,
);
