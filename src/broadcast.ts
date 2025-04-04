export type Listener<T extends unknown[]> = (...args: T) => void;

/**
 * A broadcast channel for dispatching events to multiple listeners.
 * 
 * @internal
 */
export class BroadcastChannel<T extends unknown[]> {
  private listeners: Array<Listener<T>> = [];

  public addListener(listener: Listener<T>): () => void {
    this.listeners.push(listener);
    return () => this.removeListener(listener);
  }

  public removeListener(listener: Listener<T>): void {
    const idx = this.listeners.indexOf(listener);
    if (idx !== -1) {
      this.listeners.splice(idx, 1);
    }
  }

  public broadcast(...args: T): void {
    for (const listener of this.listeners) {
      try {
        listener(...args);
      } catch {
        // ignore
      }
    }
  }
}