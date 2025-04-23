/**
 * Simple key-value store interface. JS client SDK has its own implementation based on localStorage.
 */
export interface KVStore<T> {
  get(key: string): T | null;
  entries(): Record<string, T>;
  getKeys(): string[];
  setEntries(entries: Record<string, T>): void;
}

export class MemoryStore<T> implements KVStore<T> {
  private store: Record<string, T> = {};

  get(key: string): T | null {
    return this.store[key] ?? null;
  }

  entries(): Record<string, T> {
    return this.store;
  }

  getKeys(): string[] {
    return Object.keys(this.store);
  }

  setEntries(entries: Record<string, T>): void {
    this.store = { ...entries };
  }
}
