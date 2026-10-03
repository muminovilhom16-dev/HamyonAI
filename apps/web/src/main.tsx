import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthPage } from './landing/AuthPage';
import { Landing } from './landing/Landing';
import { usePath } from './router';
import '@fontsource-variable/inter';
import './styles.css';
import './landing/landing.css';

function Root() {
  const path = usePath();
  if (path.startsWith('/app')) return <App />;
  if (path === '/login') return <AuthPage mode="login" />;
  if (path === '/signup') return <AuthPage mode="signup" />;
  return <Landing />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
