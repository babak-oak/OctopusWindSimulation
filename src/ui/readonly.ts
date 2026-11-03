import { createContext } from 'react';

/** True on view-only pages: inputs are disabled. */
export const ReadOnly = createContext(false);

/** Set on the open model for visitors without an account: any attempt to change a value calls it (opens the sign-up prompt). */
export const Gate = createContext<(() => void) | null>(null);
