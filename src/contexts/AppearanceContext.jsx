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

    // Apply theme attribute globally so CSS [data-theme] rules take effect
    const themeAttr = appearance.theme || 'purple';
    root.setAttribute('data-theme', themeAttr === 'custom' ? 'custom' : themeAttr);

    // Brand colors: for custom, set inline colors; for presets, allow CSS theme to control
    if (themeAttr === 'custom') {
      root.style.setProperty('--color-brand-primary', appearance.customColors.primary);
      root.style.setProperty('--color-brand-fuchsia', appearance.customColors.secondary);
    } else {
      root.style.removeProperty('--color-brand-primary');
      root.style.removeProperty('--color-brand-fuchsia');
    }

    // Gradient angle (variable expected by CSS is --brand-angle)
    root.style.setProperty('--brand-angle', `${appearance.angle}deg`);

    // Glow color
    const glowColor = appearance.glow.mode === 'custom' && appearance.glow.color
      ? appearance.glow.color
      : (themeAttr === 'custom' ? appearance.customColors.primary : getComputedStyle(root).getPropertyValue('--color-brand-primary').trim() || appearance.customColors.primary);
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

    // Card/widget border customization (color, width, radius)
    const borders = appearance.borders || {}
    const bColor = borders.color || null
    const bWidth = Number.isFinite(borders.width) ? borders.width : null
    const bRadius = Number.isFinite(borders.radius) ? borders.radius : null
    if (typeof bColor === 'string') root.style.setProperty('--card-border-color', bColor)
    else root.style.removeProperty('--card-border-color')
    if (bWidth != null) root.style.setProperty('--card-border-width', `${Math.max(0, bWidth)}px`)
    else root.style.removeProperty('--card-border-width')
    if (bRadius != null) root.style.setProperty('--card-radius', `${Math.max(0, bRadius)}px`)
    else root.style.removeProperty('--card-radius')
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
