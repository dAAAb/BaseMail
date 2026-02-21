import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi';
import './index.css';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
const AgentProfile = lazy(() => import('./pages/AgentProfile'));

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/agent/:handle" element={<Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-gray-400">Loading…</div>}><AgentProfile /></Suspense>} />
            <Route path="/dashboard/*" element={<Dashboard />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
