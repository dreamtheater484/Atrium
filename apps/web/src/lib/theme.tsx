import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: ThemePref;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'system', resolved: 'light', setTheme: () => {} });

function systemDark() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function readPref(): ThemePref {
  try {
    return (localStorage.getItem('atrium.theme') as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({
  children,
  onChange,
}: {
  children: ReactNode;
  onChange?: (t: ThemePref) => void;
}) {
  const [theme, setThemeState] = useState<ThemePref>(readPref);
  const [sysDark, setSysDark] = useState(systemDark);
  const resolved = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSysDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Applied during render (not in an effect) so charts that read the colour tokens while
  // rendering already see the new theme.
  if (typeof document !== 'undefined')
    document.documentElement.classList.toggle('dark', resolved === 'dark');

  const setTheme = useCallback(
    (t: ThemePref) => {
      setThemeState(t);
      try {
        localStorage.setItem('atrium.theme', t);
      } catch {
        // ignore
      }
      onChange?.(t);
    },
    [onChange],
  );

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
