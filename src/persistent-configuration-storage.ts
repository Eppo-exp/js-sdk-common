import { IConfiguration } from './i-configuration';

/**
 * Persistent configuration storages are responsible for persisting
 * configuration between SDK reloads.
 */
// TODO: replace `IConfiguration` with a concrete `Configuration` type.
export interface PersistentConfigurationStorage {
  /**
   * Load configuration from the persistent storage.
   *
   * The method may fail to load a configuration or throw an
   * exception (which is generally ignored).
   */
  loadConfiguration(): PromiseLike<IConfiguration | null>;

  /**
   * Store configuration to the persistent storage.
   *
   * The method is allowed to do async work (which is not awaited) or
   * throw exceptions (which are ignored).
   */
  storeConfiguration(configuration: IConfiguration | null): void;
}
