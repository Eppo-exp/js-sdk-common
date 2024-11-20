import NamedEventQueue from './named-event-queue';

export default class EventQueueFactory {
  static async create<T>(storageKey: string): Promise<NamedEventQueue<T>> {
    if (typeof window !== 'undefined') {
      const { default: LocalStorageBackedNamedEventQueue } = await import(
        './local-storage-backed-named-event-queue'
      );
      return new LocalStorageBackedNamedEventQueue<T>(storageKey);
    } else {
      const { default: FileBackedNamedEventQueue } = await import(
        './file-backed-named-event-queue'
      );
      return new FileBackedNamedEventQueue<T>(storageKey);
    }
  }
}
