import { expect, it } from "vitest";
import { woodImpact } from "./wood-sound";
it("creates a short bounded impact with a quiet tail at browser sample rates", () => {
  for (const rate of [44100, 48000]) {
    const samples = woodImpact(rate);
    expect(samples.length).toBe(Math.ceil(rate * 0.19));
    expect(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1)).toBe(true);
    expect(Math.abs(samples[0])).toBe(0);
    expect(Math.max(...samples.slice(-100))).toBeLessThan(0.001);
    expect(samples).not.toEqual(woodImpact(rate, 1.5));
  }
});
