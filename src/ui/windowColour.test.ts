import { describe, expect, it } from 'vitest';
import { rgbaOf } from './windowColour';

describe('rgbaOf', () => {
  it('reads rgb and rgba colours as Tauri wants them', () => {
    expect(rgbaOf('rgb(250, 250, 249)')).toEqual([250, 250, 249, 255]);
    expect(rgbaOf('rgba(24, 24, 24, 0.5)')).toEqual([24, 24, 24, 128]);
    expect(rgbaOf('rgb(24 24 24 / 50%)')).toEqual([24, 24, 24, 128]);
  });
  it('leaves other colours alone', () => {
    expect(rgbaOf('transparent')).toBeNull();
    expect(rgbaOf('color(srgb 1 1 1)')).toBeNull();
  });
});
