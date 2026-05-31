import { createContext, useContext } from 'react';

export const PreferencesContext = createContext(null);

/** Read the preferences store; throws if used outside a <PreferencesProvider>. */
export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
};
