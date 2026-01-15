import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
    const [theme, setTheme] = useState<ThemeMode>(() => {
        // Init from storage or default to system
        const saved = localStorage.getItem('app-theme');
        return (saved as ThemeMode) || 'system';
    });

    useEffect(() => {
        const root = document.documentElement;

        // Remove existing attribute to reset
        root.removeAttribute('data-theme');

        let effectiveTheme = theme;

        if (theme === 'system') {
            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            effectiveTheme = systemDark ? 'dark' : 'light';
        }

        root.setAttribute('data-theme', effectiveTheme);

        // Save preference
        localStorage.setItem('app-theme', theme);

        // Listener for system changes if in system mode
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = (e: MediaQueryListEvent) => {
                root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            };
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }

    }, [theme]);

    return { theme, setTheme };
}
