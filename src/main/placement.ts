export type Rect = { x: number; y: number; width: number; height: number };

export function isReachable(window: Rect, workAreas: Rect[]): boolean {
  return workAreas.some((workArea) => {
    const overlapWidth =
      Math.min(window.x + window.width, workArea.x + workArea.width) -
      Math.max(window.x, workArea.x);
    const overlapHeight =
      Math.min(window.y + window.height, workArea.y + workArea.height) -
      Math.max(window.y, workArea.y);

    return overlapWidth >= 64 && overlapHeight >= 64;
  });
}
