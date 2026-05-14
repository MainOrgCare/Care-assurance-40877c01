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
    description: "Neutral enterprise light palette",
    preview: {
      bgStart: "hsl(220 16% 98%)",
      bgEnd: "hsl(220 14% 97%)",
      accent: "hsl(211 100% 47%)",
      accentAlt: "hsl(199 84% 44%)",
      surface: "hsl(0 0% 100%)",
      surfaceAlt: "hsl(220 14% 96%)",
      border: "hsl(220 13% 91%)",
    },
  },
  {
    value: "sunrise",
    label: "Sunrise",
    description: "Warm paper-toned light palette",
    preview: {
      bgStart: "hsl(34 56% 98%)",
      bgEnd: "hsl(33 44% 96%)",
      accent: "hsl(18 78% 40%)",
      accentAlt: "hsl(38 80% 42%)",
      surface: "hsl(0 0% 100%)",
      surfaceAlt: "hsl(33 36% 93%)",
      border: "hsl(28 22% 84%)",
    },
  },
  {
    value: "dark",
    label: "Dark",
    description: "Balanced graphite dark workspace",
    preview: {
      bgStart: "hsl(222 18% 7%)",
      bgEnd: "hsl(222 16% 6%)",
      accent: "hsl(211 100% 60%)",
      accentAlt: "hsl(173 58% 50%)",
      surface: "hsl(222 16% 10%)",
      surfaceAlt: "hsl(222 14% 14%)",
      border: "hsl(220 12% 18%)",
    },
  },
  {
    value: "midnight",
    label: "Midnight",
    description: "Deep blue dark with amber accents",
    preview: {
      bgStart: "hsl(228 28% 7%)",
      bgEnd: "hsl(226 28% 6%)",
      accent: "hsl(200 78% 56%)",
      accentAlt: "hsl(28 78% 54%)",
      surface: "hsl(220 22% 11%)",
      surfaceAlt: "hsl(220 18% 16%)",
      border: "hsl(220 14% 22%)",
    },
  },
  {
    value: "ocean",
    label: "Ocean",
    description: "Teal-driven dark palette",
    preview: {
      bgStart: "hsl(200 42% 9%)",
      bgEnd: "hsl(200 38% 7%)",
      accent: "hsl(168 76% 42%)",
      accentAlt: "hsl(199 89% 48%)",
      surface: "hsl(200 26% 12%)",
      surfaceAlt: "hsl(200 24% 18%)",
      border: "hsl(200 22% 22%)",
    },
  },
  {
    value: "aurora",
    label: "Aurora",
    description: "Emerald dark palette",
    preview: {
      bgStart: "hsl(164 28% 8%)",
      bgEnd: "hsl(166 26% 7%)",
      accent: "hsl(152 56% 46%)",
      accentAlt: "hsl(178 60% 42%)",
      surface: "hsl(166 22% 12%)",
      surfaceAlt: "hsl(166 18% 17%)",
      border: "hsl(164 14% 22%)",
    },
  },
];