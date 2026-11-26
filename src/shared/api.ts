export type SeienApi = {
  /** Bytes of the chosen .vrm, or null when no avatar is chosen. Rejects when the file cannot be read. */
  loadAvatar(): Promise<ArrayBuffer | null>;
  /** Called when the user picks another avatar from the tray menu. */
  onAvatarChanged(listener: () => void): void;
  /** Whether the pointer is over a pixel of the avatar. */
  setHit(hit: boolean): void;
  /** Move the window by this many pixels. */
  dragBy(dx: number, dy: number): void;
  /** The drag is over; the position should be saved. */
  dragEnd(): void;
};
