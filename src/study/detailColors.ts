interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hexToHsl(hex: string): HslColor {
  const value = hex.replace('#', '');
  const [red, green, blue] = [0, 2, 4]
    .map(index => Number.parseInt(value.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

function hslToHex({ hue, saturation, lightness }: HslColor): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = bounded(saturation, 0, 100) / 100;
  const normalizedLightness = bounded(lightness, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const component = chroma * (1 - Math.abs((normalizedHue / 60) % 2 - 1));
  const offset = normalizedLightness - chroma / 2;
  const sector = Math.floor(normalizedHue / 60);
  const rgb = [
    [chroma, component, 0],
    [component, chroma, 0],
    [0, chroma, component],
    [0, component, chroma],
    [component, 0, chroma],
    [chroma, 0, component],
  ][sector] ?? [0, 0, 0];

  return `#${rgb
    .map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

const HUE_OFFSETS = [-10, 10, -5, 5, -14, 14, 0, -8, 8, -3, 3, -12, 12] as const;
const SATURATION_OFFSETS = [14, -2, 8, -8, 3, -12, 11, -5, 6, -10, 1, -7, 9] as const;

/** Creates distinct related colors while preserving the selected subject's color family. */
export function subjectFamilyDetailColor(baseColor: string, index: number, total: number): string {
  if (total <= 1) return baseColor;
  const base = hexToHsl(baseColor);
  const pairIndex = Math.floor(index / 2);
  const rank = index % 2 === 0 ? pairIndex : total - 1 - pairIndex;
  const position = rank / (total - 1);
  const minimumLightness = bounded(base.lightness - 30, 30, 48);
  const maximumLightness = bounded(base.lightness + 16, 70, 84);
  const baseSaturation = Math.max(base.saturation, 38);

  return hslToHex({
    hue: base.hue + HUE_OFFSETS[index % HUE_OFFSETS.length],
    saturation: bounded(
      baseSaturation + SATURATION_OFFSETS[index % SATURATION_OFFSETS.length],
      30,
      72,
    ),
    lightness: minimumLightness + (maximumLightness - minimumLightness) * position,
  });
}
