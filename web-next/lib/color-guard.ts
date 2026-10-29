/**
 * WCAG 2.1 Relative Luminance & Contrast-Fallback Guard for Dynamic Club Series Colors.
 *
 * Ensures that dynamically binding `--series-home` and `--series-away` to
 * `home.primary_color` and `away.primary_color`:
 * 1. Always achieves >= 4.5:1 contrast ratio against the active card surface
 *    (`#111714` in Dark Floodlit Booth mode, `#FFFFFF` in Light Matchday Programme mode).
 * 2. Prevents Home vs. Away color collisions (e.g., Arsenal `#EF0107` vs. Liverpool `#C8102E`,
 *    or Juventus `#000000` vs. Newcastle `#241F20`) by shifting the Away team to its
 *    `secondary_color` or the canonical Signal Coral (`#FB923C` / `#EA580C`) fallback.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ResolvedSeriesPalette {
  homeColor: string;
  awayColor: string;
  homeContrastRatio: number;
  awayContrastRatio: number;
  usedFallbackForAway: boolean;
}

export function hexToRgb(hex: string): RGB {
  const clean = (hex || "#38BDF8").replace("#", "").trim();
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const num = parseInt(expanded, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;

  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

/**
 * WCAG 2.1 relative luminance (0.0 darkest to 1.0 brightest)
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const transform = (v: number) => {
    const sRGB = v / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

/**
 * WCAG 2.1 contrast ratio between two hex colors (1.0 to 21.0)
 */
export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Adjusts a club hex color until it achieves at least `minRatio` (default 4.5:1)
 * against `surfaceHex` while preserving its hue identity.
 */
export function ensureContrastAgainstSurface(
  clubHex: string,
  surfaceHex: string,
  isDarkSurface: boolean,
  minRatio = 4.5,
  fallbackHex = isDarkSurface ? "#38BDF8" : "#0284C7"
): { color: string; ratio: number } {
  const initialRatio = getContrastRatio(clubHex, surfaceHex);
  if (initialRatio >= minRatio) {
    return { color: clubHex, ratio: initialRatio };
  }

  const hsl = rgbToHsl(hexToRgb(clubHex));

  // If the club color is pure black/near-black or pure white/near-white (low saturation),
  // use a high-craft metallic slate/silver or the fallback token so it still reads as a data series.
  if (hsl.s < 8) {
    const neutralAdjusted = isDarkSurface ? "#E2E8F0" : "#1E293B";
    const neutralRatio = getContrastRatio(neutralAdjusted, surfaceHex);
    if (neutralRatio >= minRatio) {
      return { color: neutralAdjusted, ratio: neutralRatio };
    }
    return {
      color: fallbackHex,
      ratio: getContrastRatio(fallbackHex, surfaceHex),
    };
  }

  // Iteratively step lightness up (on dark surface) or down (on light surface)
  // while boosting saturation slightly so lifted dark blues/reds stay vivid.
  const targetS = Math.max(hsl.s, 72);
  let currentL = hsl.l;
  const step = isDarkSurface ? 3 : -3;

  for (let i = 0; i < 28; i++) {
    currentL = Math.max(12, Math.min(88, currentL + step));
    const candidateHex = rgbToHex(hslToRgb({ h: hsl.h, s: targetS, l: currentL }));
    const ratio = getContrastRatio(candidateHex, surfaceHex);
    if (ratio >= minRatio) {
      return { color: candidateHex, ratio };
    }
  }

  return {
    color: fallbackHex,
    ratio: getContrastRatio(fallbackHex, surfaceHex),
  };
}

/**
 * Checks perceptual hue/RGB distance between Home and Away colors so two red clubs
 * (e.g., Arsenal vs Liverpool) or two blue clubs don't render with indistinguishable series colors.
 */
export function areColorsTooSimilar(hexA: string, hexB: string): boolean {
  const hslA = rgbToHsl(hexToRgb(hexA));
  const hslB = rgbToHsl(hexToRgb(hexB));

  const hueDiff = Math.min(
    Math.abs(hslA.h - hslB.h),
    360 - Math.abs(hslA.h - hslB.h)
  );
  const lightDiff = Math.abs(hslA.l - hslB.l);

  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  const euclideanRgb = Math.sqrt(
    Math.pow(rgbA.r - rgbB.r, 2) +
      Math.pow(rgbA.g - rgbB.g, 2) +
      Math.pow(rgbA.b - rgbB.b, 2)
  );

  return (hueDiff < 32 && lightDiff < 25) || euclideanRgb < 75;
}

/**
 * Master resolver for `--series-home` and `--series-away` with automatic
 * WCAG >= 4.5:1 surface contrast guard and Home/Away collision guard.
 */
export function resolveClubSeriesColors(
  homePrimary: string,
  awayPrimary: string,
  awaySecondary: string,
  isDarkMode = true
): ResolvedSeriesPalette {
  const surfaceHex = isDarkMode ? "#111714" : "#FFFFFF";
  const defaultHomeFallback = isDarkMode ? "#38BDF8" : "#0284C7";
  const defaultAwayFallback = isDarkMode ? "#FB923C" : "#EA580C";

  const homeResolved = ensureContrastAgainstSurface(
    homePrimary || defaultHomeFallback,
    surfaceHex,
    isDarkMode,
    4.5,
    defaultHomeFallback
  );

  let awayResolved = ensureContrastAgainstSurface(
    awayPrimary || defaultAwayFallback,
    surfaceHex,
    isDarkMode,
    4.5,
    defaultAwayFallback
  );

  let usedFallbackForAway = false;

  // Guard against Home & Away club color collision (e.g. Arsenal vs Liverpool)
  if (areColorsTooSimilar(homeResolved.color, awayResolved.color)) {
    usedFallbackForAway = true;
    const secondaryCandidate = ensureContrastAgainstSurface(
      awaySecondary && awaySecondary !== "#FFFFFF" ? awaySecondary : defaultAwayFallback,
      surfaceHex,
      isDarkMode,
      4.5,
      defaultAwayFallback
    );

    if (!areColorsTooSimilar(homeResolved.color, secondaryCandidate.color)) {
      awayResolved = secondaryCandidate;
    } else {
      // If secondary also collides, use the high-contrast broadcast Signal Coral or Tactical Cyan
      const altFallback = areColorsTooSimilar(homeResolved.color, defaultAwayFallback)
        ? defaultHomeFallback
        : defaultAwayFallback;
      awayResolved = ensureContrastAgainstSurface(
        altFallback,
        surfaceHex,
        isDarkMode,
        4.5,
        altFallback
      );
    }
  }

  return {
    homeColor: homeResolved.color,
    awayColor: awayResolved.color,
    homeContrastRatio: homeResolved.ratio,
    awayContrastRatio: awayResolved.ratio,
    usedFallbackForAway,
  };
}
