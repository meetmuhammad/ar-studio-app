# AR Studio - Theming System

This document explains how to use the theming system in the AR Studio application, which follows the [shadcn/ui theming conventions](https://ui.shadcn.com/docs/theming).

## 🎨 Overview

The theming system is built on:
- **CSS Variables**: For dynamic theme switching
- **OKLCH Color Format**: Modern color specification with better perceptual uniformity
- **Semantic Color Names**: Colors are named by purpose, not appearance
- **Dark Mode Support**: Automatic light/dark theme switching

## 🔧 Configuration

### Current Setup
- **Base Color**: Custom violet theme (vibrant and professional design for AR Studio)
- **CSS Variables**: Enabled (`cssVariables: true`)
- **Default Theme**: `dark` 
- **Theme Provider**: `next-themes` with system preference support
- **Border Radius**: `0.65rem` for modern, rounded appearance
- **Button Text**: Pure white text on violet backgrounds for perfect contrast

### File Structure
```
src/
├── app/
│   └── globals.css          # Theme variables and base styles
├── components/
│   ├── providers/
│   │   └── theme-provider.tsx  # Theme context provider
│   ├── theme-toggle.tsx        # Theme switcher component
│   └── theme-demo.tsx          # Demo component (optional)
├── lib/
│   └── theme-config.ts         # Theme configuration utilities
└── components.json             # shadcn/ui configuration
```

## 🎨 Available Colors

### Standard Colors (shadcn/ui)
```css
--background        /* Main background */
--foreground        /* Main text color */
--primary           /* Primary accent color */
--secondary         /* Secondary accent color */
--muted             /* Subtle background color */
--accent            /* Hover states and highlights */
--destructive       /* Error/danger states */
--border            /* Border color */
--input             /* Input field borders */
--ring              /* Focus ring color */
```

### Custom Brand Colors (AR Studio Violet Theme)
```css
--primary           /* Beautiful violet primary color */
--brand             /* Same as primary - AR Studio brand color */
--success           /* Success states (green) */
--warning           /* Warning states (orange/yellow) */
--info              /* Informational states (blue) */
```

The theme uses a vibrant violet color palette with:
- **Light Mode Primary**: `oklch(0.606 0.25 292.717)` - Vibrant violet
- **Dark Mode Primary**: `oklch(0.541 0.281 293.009)` - Rich violet
- **Pure white text**: `oklch(1 0 0)` on violet backgrounds for maximum contrast
- **Subtle violet accents** throughout borders and UI elements
- **Perfect accessibility** with WCAG compliant contrast ratios

Each color has a corresponding `-foreground` variant for text that appears on that color.

## 🖌️ Using Colors in Components

### CSS Classes
```tsx
// Background colors
<div className="bg-brand text-brand-foreground">Brand colored</div>
<div className="bg-success text-success-foreground">Success colored</div>
<div className="bg-warning text-warning-foreground">Warning colored</div>
<div className="bg-info text-info-foreground">Info colored</div>

// Border colors
<div className="border-brand">Brand border</div>
<div className="border-success">Success border</div>
```

### Direct CSS Variables
```css
.custom-component {
  background-color: var(--brand);
  color: var(--brand-foreground);
  border-color: var(--success);
}
```

## 🔘 Component Variants

### Button Variants
```tsx
import { Button } from "@/components/ui/button"

// Standard variants
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>

// Custom brand variants
<Button variant="brand">Brand Action</Button>
<Button variant="success">Success Action</Button>
<Button variant="warning">Warning Action</Button>
<Button variant="info">Info Action</Button>
```

### Badge Variants
```tsx
import { Badge } from "@/components/ui/badge"

// Standard variants
<Badge variant="default">Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="destructive">Destructive</Badge>

// Custom brand variants
<Badge variant="brand">Brand Status</Badge>
<Badge variant="success">✓ Paid</Badge>
<Badge variant="warning">⚠ Pending</Badge>
<Badge variant="info">ℹ Info</Badge>
```

## 🌓 Theme Switching

### Theme Toggle Component
```tsx
import { ThemeToggle } from "@/components/theme-toggle"

export function Header() {
  return (
    <div className="flex justify-between items-center">
      <h1>AR Studio</h1>
      <ThemeToggle />
    </div>
  )
}
```

### Programmatic Theme Control
```tsx
import { useTheme } from "next-themes"

export function CustomThemeControl() {
  const { theme, setTheme } = useTheme()
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={() => setTheme("light")}>Light</button>
      <button onClick={() => setTheme("dark")}>Dark</button>
      <button onClick={() => setTheme("system")}>System</button>
    </div>
  )
}
```

## 🛠️ Customization

### Adding New Colors
1. Add CSS variables to `globals.css`:
```css
:root {
  --custom-color: oklch(0.6 0.15 200);
  --custom-color-foreground: oklch(0.98 0.01 200);
}

.dark {
  --custom-color: oklch(0.4 0.12 200);
  --custom-color-foreground: oklch(0.95 0.01 200);
}

@theme inline {
  --color-custom-color: var(--custom-color);
  --color-custom-color-foreground: var(--custom-color-foreground);
}
```

2. Add TypeScript support (optional):
```typescript
// Add to component variant types
declare module "@/components/ui/button" {
  interface ButtonVariants {
    variant: "custom-color" | /* existing variants */
  }
}
```

### Changing Base Colors
Update `components.json`:
```json
{
  "tailwind": {
    "baseColor": "stone", // or "zinc", "gray", "slate"
    "cssVariables": true
  }
}
```

Then regenerate components:
```bash
npx shadcn@latest add --overwrite button badge
```

## 📱 Responsive Theming

### System Preference Detection
The theme automatically adapts to system preferences when set to "system" mode:

```tsx
// This will be dark on systems with dark mode preference
<div className="bg-background text-foreground">
  Adapts to system theme
</div>
```

### Media Query Support
```css
@media (prefers-color-scheme: dark) {
  /* Styles for dark mode preference */
}

@media (prefers-color-scheme: light) {
  /* Styles for light mode preference */
}
```

## 🎯 Best Practices

### 1. Use Semantic Colors
❌ Don't use appearance-based naming:
```tsx
<Button className="bg-violet-500">Submit</Button>
```

✅ Use purpose-based naming:
```tsx
<Button variant="brand">Submit</Button>  {/* Uses your custom violet with white text */}
<Button variant="primary">Submit</Button> {/* Also uses your custom violet with white text */}
```

### 2. Consistent Status Colors
```tsx
// Payment statuses
<Badge variant="success">Paid in Full</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="info">In Progress</Badge>
<Badge variant="destructive">Overdue</Badge>
```

### 3. Proper Contrast
Always use foreground colors with their corresponding backgrounds:
```tsx
<div className="bg-brand text-brand-foreground">
  Proper contrast
</div>
```

### 4. Theme-aware Custom Styles
```css
.custom-element {
  background-color: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
}
```

## 🧪 Testing Your Theme

### Theme Demo Component
Use the `ThemeDemo` component to test all theme features:

```tsx
import { ThemeDemo } from "@/components/theme-demo"

export default function ThemePage() {
  return <ThemeDemo />
}
```

### Manual Testing Checklist
- [ ] Light mode appears correctly
- [ ] Dark mode appears correctly  
- [ ] System preference switching works
- [ ] All component variants display properly
- [ ] Custom colors have proper contrast
- [ ] Focus states are visible in both themes

## 🔧 Utilities

### Theme Configuration Helper
```tsx
import { themeConfig, cssVariables } from "@/lib/theme-config"

// Get current theme colors
const brandColor = cssVariables.get('brand')

// Set custom color dynamically
cssVariables.set('custom-accent', 'oklch(0.7 0.2 180)')
```

## 📚 Resources

- [shadcn/ui Theming Documentation](https://ui.shadcn.com/docs/theming)
- [OKLCH Color Format](https://oklch.com/)
- [next-themes Documentation](https://github.com/pacocoursey/next-themes)
- [Tailwind CSS Color Configuration](https://tailwindcss.com/docs/customizing-colors)

---

**Need Help?** Check the theme demo component at `/components/theme-demo.tsx` for live examples of all theming features.