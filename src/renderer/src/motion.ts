export function blinkWeight(seconds: number): number {
  const elapsed = seconds % 4;

  if (elapsed >= 0.2) {
    return 0;
  }

  return Math.sin((Math.PI * elapsed) / 0.2);
}

export function breath(seconds: number): number {
  return Math.sin((2 * Math.PI * seconds) / 4);
}
