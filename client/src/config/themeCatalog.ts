import type { AppTheme } from "@/context/SettingsContext";

export interface ThemeCatalogEntry {
  value: AppTheme;
  label: string;
  description: string;
  preview: {
    bgStart: string;
    bgEnd: string;
    accent: string;
    accentAlt: string;
    surface: string;
    surfaceAlt: string;
    border: string;
  };
}

export const THEME_CATALOG: readonly ThemeCatalogEntry[] = [
  {
    value: "light",
    label: "Light",
    description: "Crisp operational light palette",
    preview: {
      bgStart: "hsl(216 24% 97%)",
      bgEnd: "hsl(214 22% 95%)",
      accent: "hsl(210 92% 43%)",
      accentAlt: "hsl(188 72% 38%)",
      surface: "hsl(210 24% 99%)",
      surfaceAlt: "hsl(216 16% 94%)",
      border: "hsl(216 16% 88%)",
    },
  },
  {
    value: "sunrise",
    label: "Sunrise",
    description: "Soft coral and teal light palette",
    preview: {
      bgStart: "hsl(18 44% 97%)",
      bgEnd: "hsl(192 28% 95%)",
      accent: "hsl(12 72% 42%)",
      accentAlt: "hsl(184 54% 34%)",
      surface: "hsl(20 36% 99%)",
      surfaceAlt: "hsl(18 28% 92%)",
      border: "hsl(18 20% 83%)",
    },
  },
  {
    value: "dark",
    label: "Dark",
    description: "Graphite dark with cyan and green accents",
    preview: {
      bgStart: "hsl(224 14% 7%)",
      bgEnd: "hsl(224 12% 6%)",
      accent: "hsl(204 96% 64%)",
      accentAlt: "hsl(166 58% 50%)",
      surface: "hsl(224 12% 11%)",
      surfaceAlt: "hsl(224 10% 16%)",
      border: "hsl(222 10% 22%)",
    },
  },
  {
    value: "midnight",
    label: "Midnight",
    description: "Charcoal blue with amber accents",
    preview: {
      bgStart: "hsl(232 22% 7%)",
      bgEnd: "hsl(226 28% 6%)",
      accent: "hsl(199 86% 60%)",
      accentAlt: "hsl(35 84% 58%)",
      surface: "hsl(232 18% 11%)",
      surfaceAlt: "hsl(232 14% 17%)",
      border: "hsl(232 12% 24%)",
    },
  },
  {
    value: "ocean",
    label: "Ocean",
    description: "Deep marine palette with clear cyan contrast",
    preview: {
      bgStart: "hsl(196 34% 8%)",
      bgEnd: "hsl(200 38% 7%)",
      accent: "hsl(170 72% 46%)",
      accentAlt: "hsl(204 86% 56%)",
      surface: "hsl(196 26% 12%)",
      surfaceAlt: "hsl(196 24% 18%)",
      border: "hsl(196 22% 24%)",
    },
  },
  {
    value: "aurora",
    label: "Aurora",
    description: "Emerald dark with violet highlights",
    preview: {
      bgStart: "hsl(164 24% 8%)",
      bgEnd: "hsl(166 26% 7%)",
      accent: "hsl(148 62% 48%)",
      accentAlt: "hsl(270 52% 64%)",
      surface: "hsl(166 22% 12%)",
      surfaceAlt: "hsl(166 18% 18%)",
      border: "hsl(164 14% 24%)",
    },
  },
];