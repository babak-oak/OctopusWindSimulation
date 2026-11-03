import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  enabled: boolean;
  session: Session | null;
  ready: boolean;
}
const Ctx = createContext<AuthState>({ enabled: false, session: null, ready: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={{ enabled: !!supabase, session, ready }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Password rule from the spec: at least 10 characters. */
export const passwordOk = (p: string) => p.length >= 10;
