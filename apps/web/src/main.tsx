import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, domAnimation } from 'framer-motion';
import { Notifier } from './components/ui/notify';
import { router } from './routes/router';
import { queryClient } from './lib/query';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ميزات الحركة المستخدمة فقط (بلا السحب والـ layout) — strict يمنع استخدام motion الكامل بالخطأ */}
    <LazyMotion features={domAnimation} strict>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Notifier />
      </QueryClientProvider>
    </LazyMotion>
  </React.StrictMode>,
);
