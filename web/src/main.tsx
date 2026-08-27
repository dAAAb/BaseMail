import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import './index.css';

// Prerendered public pages are imported eagerly so they can hydrate the HTML
// the server already sent (no loading flash, better LCP). App pages stay lazy.
import Landing from './pages/Landing';
import { About, Contact, Privacy, Developers, NotFoundPage } from './pages/StaticPages';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const AgentProfile = lazy(() => import('./pages/AgentProfile'));
const Claim = lazy(() => import('./pages/Claim'));
// Wallet providers only exist on routes that need a wallet.
const WalletApp = lazy(() => import('./WalletApp'));

const Loading = () => (
  <div className="min-h-screen bg-bg flex items-center justify-center text-fg-subtle animate-pulse">
    Loading…
  </div>
);

const app = (
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/developers" element={<Developers />} />
            <Route path="/agent/:handle" element={<AgentProfile />} />
            <Route path="/dashboard/*" element={<WalletApp><Dashboard /></WalletApp>} />
            <Route path="/claim/:id" element={<WalletApp><Claim /></WalletApp>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

const root = document.getElementById('root')!;
// `data-prerendered` is stamped by scripts/prerender.mjs on pages that ship real
// HTML; hydrate those, render everything else from scratch.
if (root.dataset.prerendered === 'true' && root.firstElementChild) {
  ReactDOM.hydrateRoot(root, app);
} else {
  ReactDOM.createRoot(root).render(app);
}
