export type SeienApi = {
  /** Bytes of the chosen .vrm, or null when no avatar is chosen. Rejects when the file cannot be read. */
  loadAvatar(): Promise<ArrayBuffer | null>;
  /** Called when the user picks another avatar from the tray menu. */
  onAvatarChanged(listener: () => void): void;
  /** Whether the pointer is over a pixel of the avatar. */
  setHit(hit: boolean): void;
  /** A drag of the window has started. */
  dragStart(): void;
  /** The pointer moved during a drag; the window should follow the cursor. */
  dragMove(): void;
  /** The drag is over; the position should be saved. */
  dragEnd(): void;
};
