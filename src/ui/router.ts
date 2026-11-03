import { useEffect, useState } from 'react';

// Hash routes work on GitHub Pages without server rewrites.
export type Route =
  | { page: 'home' }
  | { page: 'tool' }
  | { page: 'contacts' }
  | { page: 'login'; mode: 'signin' | 'signup' | 'reset' }
  | { page: 'projects' }
  | { page: 'project'; id: string }
  | { page: 'share'; token: string };

export function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'tool') return { page: 'tool' };
  if (a === 'contacts') return { page: 'contacts' };
  if (a === 'login') return { page: 'login', mode: b === 'signup' ? 'signup' : b === 'reset' ? 'reset' : 'signin' };
  if (a === 'projects') return { page: 'projects' };
  if (a === 'p' && b) return { page: 'project', id: b };
  if (a === 's' && b) return { page: 'share', token: b };
  return { page: 'home' };
}

export function go(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setR(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
