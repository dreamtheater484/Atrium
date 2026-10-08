import { describe, expect, it } from 'vitest';
import { mix, readableText, tint, toHex } from './color';

describe('toHex', () => {
  it('accepts hex in all its shapes', () => {
    expect(toHex('#4f46e5')).toBe('4F46E5');
    expect(toHex('4f46e5')).toBe('4F46E5');
    expect(toHex('#abc')).toBe('AABBCC');
    expect(toHex('#4f46e580')).toBe('4F46E5');
    expect(toHex('  #2F9E7A ')).toBe('2F9E7A');
  });

  it('accepts rgb(), rgba() and hsl()', () => {
    expect(toHex('rgb(79,70,229)')).toBe('4F46E5');
    expect(toHex('rgb(79, 70, 229)')).toBe('4F46E5');
    expect(toHex('rgba(217, 83, 79, 0.5)')).toBe('D9534F');
    expect(toHex('rgb(79 70 229 / 50%)')).toBe('4F46E5');
    expect(toHex('rgb(100%, 0%, 0%)')).toBe('FF0000');
    expect(toHex('hsl(0, 100%, 50%)')).toBe('FF0000');
    expect(toHex('white')).toBe('FFFFFF');
  });

  it('falls back for anything it cannot read', () => {
    expect(toHex('var(--accent)')).toBe('C7CBD4');
    expect(toHex('', '000000')).toBe('000000');
    expect(toHex(undefined)).toBe('C7CBD4');
    expect(toHex('rgb(1,2)')).toBe('C7CBD4');
  });
});

describe('colour helpers', () => {
  it('mixes and tints', () => {
    expect(mix('000000', 'FFFFFF', 0.5)).toBe('808080');
    expect(tint('4F46E5', 1)).toBe('FFFFFF');
    expect(tint('4F46E5', 0)).toBe('4F46E5');
  });

  it('picks legible text colours', () => {
    expect(readableText('4F46E5')).toBe('FFFFFF');
    expect(readableText('D9534F')).toBe('FFFFFF');
    expect(readableText('E0A526')).toBe('1F2433');
    expect(readableText('C7CBD4')).toBe('1F2433');
    expect(readableText('FFFFFF')).toBe('1F2433');
  });
});
