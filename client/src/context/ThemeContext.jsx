import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'settlenet_theme';
const ThemeContext = createContext(null);

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const setMode = useCallback((next) => {
    setModeState(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  }, []);

  const value = useMemo(() => ({ mode, setMode, isDark }), [mode, setMode, isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);