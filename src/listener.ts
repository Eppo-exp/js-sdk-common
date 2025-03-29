export type Listener<T extends unknown[]> = (...args: T) => void;

export class Listeners<T extends unknown[]> {
  private listeners: Array<Listener<T>> = [];

  public addListener(listener: Listener<T>): () => void {
    this.listeners.push(listener);

    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  public notify(...args: T): void {
    for (const listener of this.listeners) {
      try {
        listener(...args);
      } catch {
        // ignore
      }
    }
  }
}
