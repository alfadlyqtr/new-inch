import { createContext, useContext, useState, useEffect } from 'react';

const AppearanceContext = createContext();

export const AppearanceProvider = ({ children }) => {
  const [appearance, setAppearance] = useState({
    theme: 'purple',
    customColors: {
      primary: '#7C3AED',
      secondary: '#D946EF',
    },
    angle: 90,
    glow: {
      mode: 'match',
      color: null,
      depth: 60,
    },
  });

  // Only update CSS variables here. Persistence is handled by Settings.jsx per-user.
  useEffect(() => {
    const root = document.documentElement;

    // Brand colors
    root.style.setProperty('--color-brand-primary', appearance.customColors.primary);
    root.style.setProperty('--color-brand-fuchsia', appearance.customColors.secondary);

    // Gradient angle
    root.style.setProperty('--gradient-angle', `${appearance.angle}deg`);

    // Glow color
    const glowColor = appearance.glow.mode === 'custom' && appearance.glow.color
      ? appearance.glow.color
      : appearance.customColors.primary;
    root.style.setProperty('--glow-color', glowColor);

    // Glow intensity
    const d = appearance.glow.depth || 60;
    const a1 = 55 + d * 0.4;
    const a2 = 45 + d * 0.4;
    const a3 = 30 + d * 0.35;
    const soft = 18 + d * 0.18;
    const outer = 30 + d * 0.22;
    root.style.setProperty('--glow-a1', `${a1}%`);
    root.style.setProperty('--glow-a2', `${a2}%`);
    root.style.setProperty('--glow-a3', `${a3}%`);
    root.style.setProperty('--glow-soft-blur', `${soft}px`);
    root.style.setProperty('--glow-outer-blur', `${outer}px`);
  }, [appearance]);

  const updateAppearance = (updates) => {
    setAppearance(prev => ({
      ...prev,
      ...updates,
      customColors: {
        ...prev.customColors,
        ...(updates.customColors || {}),
      },
      glow: {
        ...prev.glow,
        ...(updates.glow || {}),
      },
    }));
  };

  return (
    <AppearanceContext.Provider value={{ appearance, updateAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = () => {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return context;
};
