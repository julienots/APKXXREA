export interface Screen {
  id: string;
  el: HTMLElement;
  show(arg?: string): void;
  hide(): void;
  /** Returns true when the back gesture was consumed by the screen. */
  back?(): boolean;
}
