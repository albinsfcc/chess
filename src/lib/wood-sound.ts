/** Original simulated wooden-board impact: contact noise, wood resonance and felt damping. */
export function woodImpact(sampleRate: number, weight = 1): Float32Array {
  const samples = new Float32Array(Math.ceil(sampleRate * 0.19));
  let seed = 74321, filtered = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    filtered += 0.38 * (seed / 2147483648 - 1 - filtered);
    const attack = Math.min(1, time / 0.0007), pitch = 1 / Math.sqrt(weight);
    const body = 0.36 * Math.sin(2 * Math.PI * 310 * pitch * time) * Math.exp(-time * 65)
      + 0.18 * Math.sin(2 * Math.PI * 827 * pitch * time) * Math.exp(-time * 100)
      + 0.1 * Math.sin(2 * Math.PI * 1631 * pitch * time) * Math.exp(-time * 155);
    const contact = filtered * 0.65 * Math.exp(-time * 260);
    const felt = filtered * 0.08 * Math.exp(-time * 50);
    samples[index] = attack * (body + contact + felt) * Math.min(1, (0.19 - time) / 0.01);
  }
  return samples;
}
