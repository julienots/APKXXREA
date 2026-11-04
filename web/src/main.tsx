import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/Import';
import Analyses from './pages/Analyses';
import Analyzer from './pages/Analyzer';
import CodeExplorer from './pages/CodeExplorer';
import UiReconstructor from './pages/UiReconstructor';
import Projects from './pages/Projects';
import ProjectEditor from './pages/ProjectEditor';
import Builder from './pages/Builder';
import Settings from './pages/Settings';
import { Empty } from './components/ui';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/analyses" element={<Analyses />} />
          <Route path="/analyzer/:id?" element={<Analyzer />} />
          <Route path="/code/:id?" element={<CodeExplorer />} />
          <Route path="/ui/:id?" element={<UiReconstructor />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:pid" element={<ProjectEditor />} />
          <Route path="/builder/:pid?" element={<Builder />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Empty title="Page introuvable" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
