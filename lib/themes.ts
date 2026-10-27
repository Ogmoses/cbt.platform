/**
 * Site accent color system.
 *
 * How this plugs into the rest of the app: `tailwind.config.ts` defines
 * the `crimson` color family (buttons, links, badges, focus rings) as CSS
 * variables — `rgb(var(--color-crimson-600) / <alpha-value>)` — rather
 * than fixed hex values. Every existing `bg-crimson-600`,
 * `text-crimson-700`, etc. class name in the codebase is unchanged; it
 * just resolves to whatever these variables currently hold.
 *
 * Two things this version fixes that the first version got wrong:
 *
 * 1. Button/badge label color used to be hardcoded `text-white`
 *    everywhere, on the assumption the accent would always be dark
 *    enough for white text to read. Picking a pale or bright color (even
 *    plain white) broke that — invisible text on an invisible button,
 *    with no border to even show where it was. `getOnAccentColor()`
 *    below picks whichever of white or near-black actually has better
 *    contrast against the chosen color (standard WCAG luminance
 *    comparison), exposed as a new `--color-on-crimson` variable / the
 *    `on-crimson` Tailwind color. Every button/badge in the codebase was
 *    updated to use `text-on-crimson` instead of a hardcoded `text-white`.
 *
 * 2. The 500 shade (used for icons/accents specifically in dark mode,
 *    e.g. `dark:text-crimson-500`) used to be a simple lighten of
 *    whatever color was picked. For an inherently dark, low-saturation
 *    choice (charcoal gray, midnight purple), that could still end up
 *    too close to the dark sidebar background to read clearly.
 *    `buildRampFromHex()` now clamps 500's HSL lightness to a minimum,
 *    guaranteeing it stays visible against a dark surface regardless of
 *    how dark the original color is.
 *
 * Unlike a fixed theme list, `school_profile.theme_color` stores a
 * single hex string, and a full shade ramp is generated from it at read
 * time — but per an explicit request, the color choices themselves are
 * back to a fixed, curated palette (RECOMMENDED_COLORS) rather than an
 * open color picker: an arbitrary color is more likely to need the
 * contrast-safety logic above to work hard, and a bounded set of
 * pre-vetted, visually distinct colors is a safer and clearer choice for
 * an admin picking a school's public-facing brand color.
 *
 * Deliberately out of scope: `cream` (page/surface backgrounds) stays
 * fixed regardless of the chosen accent. Emails and printed report cards
 * also stay on the classic crimson intentionally — see the git history
 * of this file for the fuller reasoning.
 */

export interface ColorRamp {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export const DEFAULT_THEME_COLOR = "#AB1509";

// The site's original, hand-tuned ramp — kept as an exact lookup rather
// than regenerated, so the default theme pixel-matches what shipped
// before this system existed at all.
const DEFAULT_RAMP: ColorRamp = {
  50: "#FDF2F1",
  100: "#FBE1DE",
  200: "#F5BAB3",
  300: "#EC8C80",
  400: "#DE5A49",
  500: "#C22E1C",
  600: "#AB1509",
  700: "#8A1108",
  800: "#690D06",
  900: "#480904",
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  return [hue2rgb(p, q, hn + 1 / 3) * 255, hue2rgb(p, q, hn) * 255, hue2rgb(p, q, hn - 1 / 3) * 255];
}

/** WCAG relative luminance — used to pick whichever text color actually contrasts better against a given background. */
function relativeLuminance([r, g, b]: RGB): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Picks white or near-black text, whichever has better contrast against
 * the given background color — standard WCAG contrast-ratio comparison,
 * not a brightness guess. This is what makes "pick any color" safe: a
 * bright yellow accent correctly gets dark text, a deep navy gets white
 * text, automatically.
 */
export function getOnAccentColor(hex: string): string {
  const L = relativeLuminance(hexToRgb(hex));
  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithBlack = (L + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? "#FFFFFF" : "#171717";
}

/** Returns true for a validly-formed #RGB or #RRGGBB hex color. */
export function isValidHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/**
 * Builds a full 50–900 shade ramp from a single color. 600 is the color
 * itself; lighter steps blend toward white, darker steps toward black —
 * except 500, which is forced to a minimum lightness (see file header)
 * so it stays legible against a dark background no matter how dark or
 * desaturated the original color is.
 */
export function buildRampFromHex(hex: string): ColorRamp {
  if (!isValidHex(hex)) return DEFAULT_RAMP;
  if (hex.toUpperCase() === DEFAULT_THEME_COLOR) return DEFAULT_RAMP;

  const base = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(base);
  // Guarantees a legible mid-tone for dark-mode icons/accents regardless
  // of the source color's own lightness — a charcoal gray or midnight
  // purple accent still needs *something* bright enough to read here.
  const legibleOnDark = hslToRgb(h, Math.max(s, 0.35), Math.max(l, 0.55));

  return {
    50: rgbToHex(mix(base, WHITE, 0.94)),
    100: rgbToHex(mix(base, WHITE, 0.85)),
    200: rgbToHex(mix(base, WHITE, 0.68)),
    300: rgbToHex(mix(base, WHITE, 0.48)),
    400: rgbToHex(mix(base, WHITE, 0.25)),
    500: rgbToHex(legibleOnDark),
    600: rgbToHex(base),
    700: rgbToHex(mix(base, BLACK, 0.16)),
    800: rgbToHex(mix(base, BLACK, 0.30)),
    900: rgbToHex(mix(base, BLACK, 0.46)),
  };
}

function hexToChannels(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/**
 * The full set of CSS custom-property declarations for one color,
 * including the contrast-safe `--color-on-crimson` text color, as a
 * single string ready to drop inside a `:root { ... }` block.
 */
export function themeCssVars(color: string): string {
  const ramp = buildRampFromHex(color);
  const vars = (Object.keys(ramp) as unknown as (keyof ColorRamp)[])
    .map((shade) => `--color-crimson-${shade}: ${hexToChannels(ramp[shade])};`)
    .join(" ");
  const onAccent = hexToChannels(getOnAccentColor(ramp[600]));
  return `${vars} --color-on-crimson: ${onAccent};`;
}

export interface RecommendedColor {
  key: string;
  name: string;
  hex: string;
}

/**
 * A curated, fixed palette — not an open color picker (see file header
 * for why). Every entry here is deliberately saturated/dark enough to
 * work as a real accent color; there's no near-white or pastel option
 * that would read as washed-out even with correct text contrast.
 */
export const RECOMMENDED_COLORS: RecommendedColor[] = [
  { key: "crimson_red", name: "Crimson Red", hex: "#AB1509" },
  { key: "midnight_purple", name: "Midnight Purple", hex: "#1A0033" },
  { key: "vivid_orange", name: "Vivid Orange", hex: "#FF4500" },
  { key: "deep_olive", name: "Deep Olive", hex: "#1A1A00" },
  { key: "charcoal_gray", name: "Charcoal Gray", hex: "#323232" },
  { key: "vivid_yellow", name: "Vivid Yellow", hex: "#FFDB00" },
  { key: "royal_navy", name: "Royal Navy", hex: "#011F7B" },
  { key: "warm_amber", name: "Warm Amber", hex: "#FFBA09" },
  { key: "emerald_green", name: "Emerald Green", hex: "#0F7B4D" },
  { key: "teal", name: "Teal", hex: "#0D9488" },
  { key: "sky_blue", name: "Sky Blue", hex: "#0284C7" },
  { key: "indigo", name: "Indigo", hex: "#4338CA" },
  { key: "violet", name: "Violet", hex: "#7C3AED" },
  { key: "magenta_pink", name: "Magenta Pink", hex: "#C2185B" },
  { key: "rose_red", name: "Rose Red", hex: "#E11D48" },
  { key: "chocolate_brown", name: "Chocolate Brown", hex: "#6B4226" },
  { key: "slate_gray", name: "Slate Gray", hex: "#475569" },
  { key: "forest_green", name: "Forest Green", hex: "#14532D" },
];

/**
 * The school's SECONDARY color: the page background in light mode. Unlike
 * the accent, this sits behind all the body text (near-black ink), so the
 * choices are a curated set of LIGHT tints — every one keeps text easily
 * readable — rather than an open picker. (Dark mode has its own background
 * and is unaffected.)
 */
export const DEFAULT_SURFACE_COLOR = "#FFF7D3";

export const SURFACE_COLORS: RecommendedColor[] = [
  { key: "cream", name: "Cream", hex: "#FFF7D3" },
  { key: "warm_white", name: "Warm White", hex: "#FFFBF0" },
  { key: "cloud", name: "Cloud", hex: "#F1F3F5" },
  { key: "mint", name: "Mint", hex: "#E3F4E8" },
  { key: "sky_mist", name: "Sky Mist", hex: "#E1EEFA" },
  { key: "lavender", name: "Lavender", hex: "#ECE6F8" },
  { key: "blush", name: "Blush", hex: "#FBE6E3" },
  { key: "peach", name: "Peach", hex: "#FFE8D4" },
  { key: "sand", name: "Sand", hex: "#F0E8D8" },
];

/** "#fff7d3" -> "255 247 211" — the format the --color-secondary-rgb CSS variable uses. */
export function surfaceChannels(hex: string): string {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}
