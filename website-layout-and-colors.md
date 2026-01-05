# CareAssurance - Website Layout & Color Specification

> **Complete visual design documentation** with exact color values, layout structure, and theme variations.

---

## Table of Contents

1. [Layout Structure](#layout-structure)
2. [Theme System](#theme-system)
3. [Color Palettes](#color-palettes)
4. [Component Colors](#component-colors)
5. [Glass Morphism Effects](#glass-morphism-effects)
6. [Typography](#typography)
7. [Spacing & Sizing](#spacing--sizing)
8. [Scrollbar Styling](#scrollbar-styling)

---

## Layout Structure

### Overall Page Structure

```
+----------------------------------------------------------+
|                    FULL SCREEN (100vh)                    |
+----------------------------------------------------------+
|                                                          |
|  +------------+  +------------------------------------+  |
|  |            |  |         HEADER (64px/h-16)         |  |
|  |  SIDEBAR   |  +------------------------------------+  |
|  |  (256px)   |  |                                    |  |
|  |            |  |           MAIN CONTENT             |  |
|  |            |  |         (scrollable area)          |  |
|  |            |  |       max-width: 1280px (7xl)      |  |
|  |            |  |         padding: 32px (p-8)        |  |
|  |            |  |                                    |  |
|  |            |  +------------------------------------+  |
|  |            |  |            FOOTER                  |  |
|  +------------+  +------------------------------------+  |
|                                                          |
+----------------------------------------------------------+
```

### Desktop Layout (md: 768px+)

```
Sidebar Width:       256px (w-64)
Main Content:        flex-1 (remaining width)
Content Max Width:   1280px (max-w-7xl)
Content Padding:     32px (p-8)
Header Height:       64px (h-16)
```

### Mobile Layout (< 768px)

```
Sidebar:             Hidden (slide-out sheet via hamburger)
Sheet Width:         256px (w-64)
Content Padding:     16px (p-4)
Hamburger Button:    Left side of header
```

### Sidebar Structure

```
+----------------------------------+
|  LOGO SECTION (p-6 padding)      |
|  +----------------------------+  |
|  | [Icon] CareAssurance       |  |
|  +----------------------------+  |
+----------------------------------+
|  NAVIGATION (px-4 py-4)          |
|                                  |
|  [Dashboard] ..................  |
|                                  |
|  [v] Service Users               |
|      - Data Upload               |
|      - Care Planning             |
|      - Risk Assessment           |
|      - Plan Enhancer             |
|                                  |
|  [v] Care Workers                |
|      - Carers                    |
|      - EMAR Audit                |
|      - Visit Audit               |
|      - Performance               |
|                                  |
|  [v] Admin                       |
|      - Administrator Controls    |
|      - Email Assistant           |
|      - Compliance                |
|      - Features & Benefits       |
|                                  |
+----------------------------------+
|  FOOTER (p-4 border-t)           |
|  [Settings]                      |
|  [Sign Out]                      |
+----------------------------------+
```

### Header Structure

```
+------------------------------------------------------------------+
|  [Menu] (mobile only)     |                    [Name] [Avatar]   |
|                           |                    Role               |
+------------------------------------------------------------------+
```

### Footer Structure

```
+------------------------------------------------------------------+
|  (c) 2025 CareAssurance.     |     Terms & Conditions | Privacy  |
+------------------------------------------------------------------+
```

---

## Theme System

The application supports **4 color themes**:

| Theme | CSS Class | Description |
|-------|-----------|-------------|
| **Dark** | `.theme-dark` (default) | Blue/teal dark theme |
| **Midnight** | `.theme-midnight` | Deep purple tones |
| **Ocean** | `.theme-ocean` | Blue-green palette |
| **Light** | `.theme-light` | Clean professional light mode |

Theme is applied to `<html>` element and stored in localStorage.

---

## Color Palettes

### Default Dark Theme

| Variable | HSL Value | Hex Equivalent | Usage |
|----------|-----------|----------------|-------|
| `--color-primary` | `hsl(210 100% 50%)` | `#0080FF` | Primary actions, active states |
| `--color-primary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on primary |
| `--color-secondary` | `hsl(170 60% 45%)` | `#2EB88A` | Secondary actions, health indicators |
| `--color-secondary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on secondary |
| `--color-background` | `hsl(215 28% 13%)` | `#181E28` | Page background |
| `--color-foreground` | `hsl(210 20% 98%)` | `#F7F9FA` | Main text |
| `--color-card` | `hsl(215 28% 17% / 0.6)` | `#212A38` (60% opacity) | Card backgrounds |
| `--color-card-foreground` | `hsl(210 20% 98%)` | `#F7F9FA` | Card text |
| `--color-popover` | `hsl(215 28% 17% / 0.9)` | `#212A38` (90% opacity) | Popover backgrounds |
| `--color-popover-foreground` | `hsl(210 20% 98%)` | `#F7F9FA` | Popover text |
| `--color-muted` | `hsl(215 28% 25% / 0.5)` | `#2E3A4D` (50% opacity) | Muted backgrounds |
| `--color-muted-foreground` | `hsl(215 20% 70%)` | `#9CADC4` | Muted/secondary text |
| `--color-accent` | `hsl(210 100% 50% / 0.15)` | `#0080FF` (15% opacity) | Accent backgrounds |
| `--color-accent-foreground` | `hsl(210 100% 60%)` | `#3399FF` | Accent text |
| `--color-destructive` | `hsl(0 84% 60%)` | `#EF4444` | Errors, warnings |
| `--color-destructive-foreground` | `hsl(0 0% 98%)` | `#FAFAFA` | Text on destructive |
| `--color-border` | `hsl(215 28% 30% / 0.5)` | `#3A4A5E` (50% opacity) | Borders |
| `--color-input` | `hsl(215 28% 30% / 0.5)` | `#3A4A5E` (50% opacity) | Input borders |
| `--color-ring` | `hsl(210 100% 50%)` | `#0080FF` | Focus rings |

**Sidebar Colors (Dark):**

| Variable | HSL Value | Usage |
|----------|-----------|-------|
| `--color-sidebar` | `hsl(215 28% 10% / 0.8)` | Sidebar background |
| `--color-sidebar-foreground` | `hsl(210 20% 90%)` | Sidebar text |
| `--color-sidebar-primary` | `hsl(210 100% 50%)` | Active nav item |
| `--color-sidebar-primary-foreground` | `hsl(0 0% 100%)` | Active item text |
| `--color-sidebar-accent` | `hsl(215 28% 20%)` | Hover/accent bg |
| `--color-sidebar-accent-foreground` | `hsl(210 20% 98%)` | Hover text |
| `--color-sidebar-border` | `hsl(215 28% 20% / 0.5)` | Sidebar borders |
| `--color-sidebar-ring` | `hsl(210 100% 50%)` | Sidebar focus ring |

**Chart Colors (Dark):**

| Variable | HSL Value | Hex | Usage |
|----------|-----------|-----|-------|
| `--color-chart-1` | `hsl(210 100% 50%)` | `#0080FF` | Blue - Primary data |
| `--color-chart-2` | `hsl(172 66% 50%)` | `#2BBFAC` | Teal - Secondary data |
| `--color-chart-3` | `hsl(0 84% 60%)` | `#EF4444` | Red - Errors/alerts |
| `--color-chart-4` | `hsl(43 96% 64%)` | `#F5B041` | Orange - Warnings |
| `--color-chart-5` | `hsl(280 65% 60%)` | `#A855F7` | Purple - Additional |

**Background Gradient (Dark):**
```css
background-image: 
  radial-gradient(at 0% 0%, hsla(215, 60%, 18%, 1) 0px, transparent 50%),
  radial-gradient(at 100% 0%, hsla(172, 60%, 12%, 1) 0px, transparent 50%),
  radial-gradient(at 100% 100%, hsla(215, 60%, 15%, 1) 0px, transparent 50%),
  radial-gradient(at 0% 100%, hsla(172, 60%, 10%, 1) 0px, transparent 50%);
```

---

### Midnight Theme

| Variable | HSL Value | Hex Equivalent | Usage |
|----------|-----------|----------------|-------|
| `--color-primary` | `hsl(262 83% 58%)` | `#8B5CF6` | Primary purple |
| `--color-primary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on primary |
| `--color-secondary` | `hsl(280 65% 60%)` | `#A855F7` | Secondary purple |
| `--color-secondary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on secondary |
| `--color-background` | `hsl(260 30% 8%)` | `#0F0D14` | Deep purple bg |
| `--color-foreground` | `hsl(260 20% 98%)` | `#FAF9FB` | Main text |
| `--color-card` | `hsl(260 30% 12% / 0.6)` | `#1A1520` (60% opacity) | Card bg |
| `--color-card-foreground` | `hsl(260 20% 98%)` | `#FAF9FB` | Card text |
| `--color-muted` | `hsl(260 30% 20% / 0.5)` | `#2A2235` (50% opacity) | Muted bg |
| `--color-muted-foreground` | `hsl(260 20% 70%)` | `#A89BBC` | Muted text |
| `--color-accent` | `hsl(262 83% 58% / 0.15)` | `#8B5CF6` (15% opacity) | Accent bg |
| `--color-accent-foreground` | `hsl(262 83% 70%)` | `#A78BFA` | Accent text |
| `--color-border` | `hsl(260 30% 25% / 0.5)` | `#3A2E4A` (50% opacity) | Borders |
| `--color-ring` | `hsl(262 83% 58%)` | `#8B5CF6` | Focus ring |

**Sidebar Colors (Midnight):**

| Variable | HSL Value |
|----------|-----------|
| `--color-sidebar` | `hsl(260 30% 6% / 0.8)` |
| `--color-sidebar-foreground` | `hsl(260 20% 90%)` |
| `--color-sidebar-primary` | `hsl(262 83% 58%)` |
| `--color-sidebar-accent` | `hsl(260 30% 15%)` |
| `--color-sidebar-border` | `hsl(260 30% 15% / 0.5)` |

**Background Gradient (Midnight):**
```css
background-image: 
  radial-gradient(at 0% 0%, hsla(280, 50%, 15%, 1) 0px, transparent 50%),
  radial-gradient(at 100% 0%, hsla(262, 60%, 12%, 1) 0px, transparent 50%),
  radial-gradient(at 100% 100%, hsla(270, 50%, 10%, 1) 0px, transparent 50%),
  radial-gradient(at 0% 100%, hsla(262, 50%, 8%, 1) 0px, transparent 50%);
```

---

### Ocean Theme

| Variable | HSL Value | Hex Equivalent | Usage |
|----------|-----------|----------------|-------|
| `--color-primary` | `hsl(168 76% 42%)` | `#1AB394` | Primary teal |
| `--color-primary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on primary |
| `--color-secondary` | `hsl(199 89% 48%)` | `#0EA5E9` | Secondary blue |
| `--color-secondary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on secondary |
| `--color-background` | `hsl(200 35% 10%)` | `#111A1F` | Deep teal bg |
| `--color-foreground` | `hsl(200 20% 98%)` | `#F8FAFA` | Main text |
| `--color-card` | `hsl(200 35% 14% / 0.6)` | `#172228` (60% opacity) | Card bg |
| `--color-card-foreground` | `hsl(200 20% 98%)` | `#F8FAFA` | Card text |
| `--color-muted` | `hsl(200 35% 22% / 0.5)` | `#233640` (50% opacity) | Muted bg |
| `--color-muted-foreground` | `hsl(200 20% 70%)` | `#9BB3BF` | Muted text |
| `--color-accent` | `hsl(168 76% 42% / 0.15)` | `#1AB394` (15% opacity) | Accent bg |
| `--color-accent-foreground` | `hsl(168 76% 55%)` | `#34D399` | Accent text |
| `--color-border` | `hsl(200 35% 28% / 0.5)` | `#2F4652` (50% opacity) | Borders |
| `--color-ring` | `hsl(168 76% 42%)` | `#1AB394` | Focus ring |

**Sidebar Colors (Ocean):**

| Variable | HSL Value |
|----------|-----------|
| `--color-sidebar` | `hsl(200 35% 8% / 0.8)` |
| `--color-sidebar-foreground` | `hsl(200 20% 90%)` |
| `--color-sidebar-primary` | `hsl(168 76% 42%)` |
| `--color-sidebar-accent` | `hsl(200 35% 18%)` |
| `--color-sidebar-border` | `hsl(200 35% 18% / 0.5)` |

**Background Gradient (Ocean):**
```css
background-image: 
  radial-gradient(at 0% 0%, hsla(200, 60%, 15%, 1) 0px, transparent 50%),
  radial-gradient(at 100% 0%, hsla(168, 60%, 12%, 1) 0px, transparent 50%),
  radial-gradient(at 100% 100%, hsla(190, 50%, 10%, 1) 0px, transparent 50%),
  radial-gradient(at 0% 100%, hsla(168, 50%, 8%, 1) 0px, transparent 50%);
```

---

### Light Theme

| Variable | HSL Value | Hex Equivalent | Usage |
|----------|-----------|----------------|-------|
| `--color-primary` | `hsl(220 85% 50%)` | `#2563EB` | Primary blue |
| `--color-primary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on primary |
| `--color-secondary` | `hsl(160 60% 38%)` | `#10B981` | Secondary green |
| `--color-secondary-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Text on secondary |
| `--color-background` | `hsl(220 20% 97%)` | `#F5F7FA` | Light gray bg |
| `--color-foreground` | `hsl(220 25% 18%)` | `#232D3D` | Dark text |
| `--color-card` | `hsl(0 0% 100%)` | `#FFFFFF` | Pure white cards |
| `--color-card-foreground` | `hsl(220 25% 18%)` | `#232D3D` | Card text |
| `--color-popover` | `hsl(0 0% 100%)` | `#FFFFFF` | Popover bg |
| `--color-popover-foreground` | `hsl(220 25% 18%)` | `#232D3D` | Popover text |
| `--color-muted` | `hsl(220 15% 93%)` | `#EBEEF2` | Muted bg |
| `--color-muted-foreground` | `hsl(220 10% 45%)` | `#666D7A` | Muted text |
| `--color-accent` | `hsl(220 85% 50% / 0.08)` | `#2563EB` (8% opacity) | Accent bg |
| `--color-accent-foreground` | `hsl(220 85% 45%)` | `#1E56D9` | Accent text |
| `--color-destructive` | `hsl(0 72% 50%)` | `#DC2626` | Errors |
| `--color-destructive-foreground` | `hsl(0 0% 100%)` | `#FFFFFF` | Error text |
| `--color-border` | `hsl(220 15% 85%)` | `#D4D9E3` | Borders |
| `--color-input` | `hsl(220 15% 85%)` | `#D4D9E3` | Input borders |
| `--color-ring` | `hsl(220 85% 50%)` | `#2563EB` | Focus ring |

**Sidebar Colors (Light):**

| Variable | HSL Value |
|----------|-----------|
| `--color-sidebar` | `hsl(220 20% 98%)` |
| `--color-sidebar-foreground` | `hsl(220 25% 25%)` |
| `--color-sidebar-primary` | `hsl(220 85% 50%)` |
| `--color-sidebar-accent` | `hsl(220 15% 92%)` |
| `--color-sidebar-border` | `hsl(220 15% 88%)` |

**Chart Colors (Light):**

| Variable | HSL Value | Hex |
|----------|-----------|-----|
| `--color-chart-1` | `hsl(220 85% 50%)` | `#2563EB` |
| `--color-chart-2` | `hsl(160 60% 38%)` | `#10B981` |
| `--color-chart-3` | `hsl(0 72% 50%)` | `#DC2626` |
| `--color-chart-4` | `hsl(35 90% 50%)` | `#F59E0B` |
| `--color-chart-5` | `hsl(280 60% 55%)` | `#9333EA` |

**Background (Light):**
```css
background-image: none;
background-color: hsl(220 20% 97%);  /* #F5F7FA */
```

---

## Glass Morphism Effects

### Glass Variables by Theme

| Theme | `--glass-border` | `--glass-border-subtle` | `--glass-shadow` |
|-------|------------------|-------------------------|------------------|
| **Dark/Default** | `rgba(255, 255, 255, 0.1)` | `rgba(255, 255, 255, 0.05)` | `0 8px 32px rgba(0, 0, 0, 0.3)` |
| **Midnight** | `rgba(180, 140, 255, 0.15)` | `rgba(180, 140, 255, 0.08)` | `0 8px 32px rgba(80, 40, 120, 0.3)` |
| **Ocean** | `rgba(100, 220, 200, 0.15)` | `rgba(100, 220, 200, 0.08)` | `0 8px 32px rgba(20, 80, 100, 0.3)` |
| **Light** | `rgba(0, 0, 0, 0.08)` | `rgba(0, 0, 0, 0.05)` | `0 4px 20px rgba(0, 0, 0, 0.08)` |

### Glass Utility Classes

```css
.glass-card {
  background-color: var(--color-card);
  backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}

.glass-panel {
  background-color: var(--color-muted);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border-subtle);
}
```

### Applied Glass Effects

| Element | Backdrop Blur | Opacity |
|---------|---------------|---------|
| Sidebar | `backdrop-blur-xl` (24px) | 80% bg |
| Header | `backdrop-blur-md` (12px) | 40% card |
| Cards | `blur(20px)` | 60% |
| Footer | `backdrop-blur-sm` (4px) | 30% card |

---

## Typography

### Font Families

| Variable | Font Stack | Usage |
|----------|------------|-------|
| `--font-sans` | `'Plus Jakarta Sans', sans-serif` | Body text |
| `--font-heading` | `'DM Sans', sans-serif` | Headings |

### Font Sizes (Customizable)

```css
.font-small  { font-size: 14px; }
.font-medium { font-size: 16px; }  /* Default */
.font-large  { font-size: 18px; }
```

### Heading Styles

```css
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  font-weight: bold;
  letter-spacing: -0.025em;  /* tracking-tight */
}
```

### Logo Typography

```jsx
<span className="font-bold">Care</span>
<span className="font-normal">Assurance</span>
```

---

## Spacing & Sizing

### Border Radius

| Variable | Value | Usage |
|----------|-------|-------|
| `--radius` | `0.75rem` (12px) | Base radius |
| `--radius-sm` | `0.5rem` (8px) | Small elements |
| `--radius-md` | `0.625rem` (10px) | Medium elements |
| `--radius-lg` | `0.75rem` (12px) | Large elements |
| `--radius-xl` | `1rem` (16px) | Extra large |

### Compact Mode

When `.compact-mode` is applied:

| Standard | Compact |
|----------|---------|
| `p-4` (16px) | 12px |
| `p-6` (24px) | 16px |
| `p-8` (32px) | 24px |
| `py-3` (12px) | 8px |
| `py-4` (16px) | 12px |
| `gap-4` (16px) | 12px |
| `gap-6` (24px) | 16px |
| `text-2xl` | 1.25rem |
| `text-3xl` | 1.5rem |

### Key Dimensions

| Element | Size |
|---------|------|
| Sidebar width | 256px (w-64) |
| Header height | 64px (h-16) |
| Logo icon | 32px (h-8 w-8) |
| Avatar | 36px (h-9 w-9) |
| Nav item padding | 16px horizontal, 12px vertical |
| Content max-width | 1280px (max-w-7xl) |
| Content padding | 32px (p-8 desktop), 16px (p-4 mobile) |

---

## Scrollbar Styling

### Custom Scrollbar Dimensions

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  border-radius: 4px;
}
```

### Scrollbar Colors by Theme

| Theme | Thumb Color | Thumb Hover |
|-------|-------------|-------------|
| **Dark** | `hsl(200 35% 30%)` | `hsl(200 35% 40%)` |
| **Midnight** | `hsl(270 30% 25%)` | `hsl(270 30% 35%)` |
| **Ocean** | `hsl(168 76% 25%)` | `hsl(168 76% 35%)` |
| **Light** | `hsl(215 20% 70%)` | `hsl(215 20% 60%)` |

### Firefox Scrollbar

```css
* {
  scrollbar-color: var(--scrollbar-thumb) transparent;
  scrollbar-width: thin;
}
```

---

## Navigation States

### Sidebar Navigation

| State | Background | Text |
|-------|------------|------|
| **Active/Selected** | `bg-sidebar-primary` | `text-sidebar-primary-foreground` |
| **Hover** | `bg-sidebar-accent` | `text-sidebar-foreground` |
| **Default** | transparent | `text-sidebar-foreground/70` |
| **Submenu Active** | `bg-sidebar-accent` | `text-sidebar-foreground` |
| **Submenu Default** | transparent | `text-sidebar-foreground/60` |

### Icon States

| State | Color |
|-------|-------|
| Active | `text-white` |
| Hover | `text-sidebar-foreground` |
| Default | `text-sidebar-foreground/50` |

---

## Background Noise Overlay

A subtle noise texture is applied over all themes:

```css
.fixed.inset-0 {
  background-image: url('https://grainy-gradients.vercel.app/noise.svg');
  opacity: 20%;
  pointer-events: none;
  z-index: 0;
}
```

---

## Logo Colors

The CareAssurance logo uses a gradient icon:

```css
.logo-icon {
  background: linear-gradient(to bottom-right, #14B8A6, #06B6D4);
  /* from-teal-500 to-cyan-500 */
  border-radius: 0.375rem;  /* rounded-md */
}

.logo-icon svg {
  color: white;  /* ShieldCheck icon */
}
```

---

## Summary Color Quick Reference

### Primary Brand Colors

| Purpose | Dark Theme | Midnight | Ocean | Light |
|---------|------------|----------|-------|-------|
| Primary | `#0080FF` | `#8B5CF6` | `#1AB394` | `#2563EB` |
| Secondary | `#2EB88A` | `#A855F7` | `#0EA5E9` | `#10B981` |
| Background | `#181E28` | `#0F0D14` | `#111A1F` | `#F5F7FA` |
| Card | `#212A38` | `#1A1520` | `#172228` | `#FFFFFF` |
| Text | `#F7F9FA` | `#FAF9FB` | `#F8FAFA` | `#232D3D` |
| Muted Text | `#9CADC4` | `#A89BBC` | `#9BB3BF` | `#666D7A` |
| Border | `#3A4A5E` | `#3A2E4A` | `#2F4652` | `#D4D9E3` |
| Error | `#EF4444` | `#EF4444` | `#EF4444` | `#DC2626` |
