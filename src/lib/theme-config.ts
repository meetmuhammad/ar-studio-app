/**
 * Theme Configuration for AR Studio
 * 
 * This file contains theme configurations and utilities for managing
 * the application's appearance following shadcn/ui theming patterns.
 */

export const themeConfig = {
  // Available themes
  themes: {
    light: "light",
    dark: "dark",
    system: "system",
  },
  
  // Default theme
  defaultTheme: "dark" as const,
  
  // Available color schemes
  baseColors: {
    neutral: "neutral",
    stone: "stone", 
    zinc: "zinc",
    gray: "gray",
    slate: "slate",
  },
  
  // Current base color
  currentBaseColor: "neutral" as const,
  
  // Custom brand colors (OKLCH format) - Updated to match your violet theme
  themeColors: {
    light: {
      // Primary violet theme colors
      primary: "oklch(0.606 0.25 292.717)",
      "primary-foreground": "oklch(1 0 0)", // Pure white
      
      // Custom brand colors
      brand: "oklch(0.606 0.25 292.717)", // Using primary as brand
      "brand-foreground": "oklch(1 0 0)", // Pure white for better contrast
      warning: "oklch(0.84 0.16 84)",
      "warning-foreground": "oklch(0.28 0.07 46)",
      success: "oklch(0.65 0.17 156)", 
      "success-foreground": "oklch(0.97 0.01 156)",
      info: "oklch(0.6 0.12 234)",
      "info-foreground": "oklch(0.97 0.01 234)",
    },
    dark: {
      // Primary violet theme colors
      primary: "oklch(0.541 0.281 293.009)",
      "primary-foreground": "oklch(1 0 0)", // Pure white
      
      // Custom brand colors  
      brand: "oklch(0.541 0.281 293.009)", // Using primary as brand
      "brand-foreground": "oklch(1 0 0)", // Pure white for better contrast
      warning: "oklch(0.41 0.11 46)",
      "warning-foreground": "oklch(0.99 0.02 95)",
      success: "oklch(0.45 0.12 156)",
      "success-foreground": "oklch(0.97 0.01 156)",
      info: "oklch(0.45 0.10 234)",
      "info-foreground": "oklch(0.97 0.01 234)",
    }
  },
  
  // Component customization
  components: {
    borderRadius: {
      sm: "calc(var(--radius) - 4px)",
      md: "calc(var(--radius) - 2px)", 
      lg: "var(--radius)", // Now 0.65rem
      xl: "calc(var(--radius) + 4px)",
    }
  },
  
  // Theme description
  description: "Beautiful violet theme with vibrant colors and perfect contrast for AR Studio - now with pure white text on violet backgrounds"
}

// Utility function to apply theme
export function applyTheme(theme: keyof typeof themeConfig.themes) {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }
}

// Utility to get current theme
export function getCurrentTheme(): string {
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  }
  return themeConfig.defaultTheme
}

// CSS custom property utilities
export const cssVariables = {
  // Get CSS variable value
  get(variable: string): string {
    if (typeof document !== 'undefined') {
      return getComputedStyle(document.documentElement).getPropertyValue(`--${variable}`).trim()
    }
    return ''
  },
  
  // Set CSS variable value
  set(variable: string, value: string): void {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(`--${variable}`, value)
    }
  }
}

export default themeConfig