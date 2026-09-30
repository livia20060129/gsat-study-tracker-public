import assert from 'node:assert/strict';
import test from 'node:test';

import { subjectFamilyDetailColor } from '../src/study/detailColors.ts';
import { SUBJECT_TIME_COLORS } from '../src/study/subjectTime.ts';

interface HslColor {
  hue: number;
  saturation: number;
  lightness: number;
}

function hsl(hex: string): HslColor {
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

function hueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
}

test('every subject palette uses distinct colors inside the same color family', () => {
  Object.entries(SUBJECT_TIME_COLORS).forEach(([subject, baseColor]) => {
    const base = hsl(baseColor);
    const colors = Array.from(
      { length: 6 },
      (_, index) => subjectFamilyDetailColor(baseColor, index, 6),
    );
    assert.equal(new Set(colors).size, 6, subject);
    const variants = colors.map(hsl);
    variants.forEach(color => assert.ok(hueDistance(color.hue, base.hue) <= 16, subject));
    const lightnessValues = variants.map(color => color.lightness);
    assert.ok(Math.max(...lightnessValues) - Math.min(...lightnessValues) > 35, subject);
    assert.ok(new Set(variants.map(color => Math.round(color.saturation))).size >= 4, subject);
  });
});

test('a single item keeps the exact subject color', () => {
  Object.values(SUBJECT_TIME_COLORS).forEach(baseColor => {
    assert.equal(subjectFamilyDetailColor(baseColor, 0, 1), baseColor);
  });
});
