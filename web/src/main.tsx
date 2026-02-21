import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmi';
import ErrorBoundary from './ErrorBoundary';
import './index.css';

// All pages lazy-loaded to isolate failures
const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentProfile = lazy(() => import('./pages/AgentProfile'));

const queryClient = new QueryClient();

const Loading = () => (
  <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-gray-400 animate-pulse">
    Loading…
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/agent/:handle" element={<AgentProfile />} />
                <Route path="/dashboard/*" element={<Dashboard />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
