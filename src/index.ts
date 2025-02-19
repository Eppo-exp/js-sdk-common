import ApiEndpoints from './api-endpoints';
import { logger as applicationLogger, loggerPrefix } from './application-logger';
import { IAssignmentHooks } from './assignment-hooks';
import { IAssignmentLogger, IAssignmentEvent } from './assignment-logger';
import { IBanditLogger, IBanditEvent } from './bandit-logger';
import {
  AbstractAssignmentCache,
  AssignmentCache,
  AsyncMap,
  AssignmentCacheKey,
  AssignmentCacheValue,
  AssignmentCacheEntry,
  assignmentCacheKeyToString,
  assignmentCacheValueToString,
} from './cache/abstract-assignment-cache';
import { LRUInMemoryAssignmentCache } from './cache/lru-in-memory-assignment-cache';
import { NonExpiringInMemoryAssignmentCache } from './cache/non-expiring-in-memory-cache-assignment';
import EppoClient, {
  EppoClientParameters,
  FlagConfigurationRequestParameters,
  IAssignmentDetails,
  IContainerExperiment,
} from './client/eppo-client';
import EppoPrecomputedClient, {
  PrecomputedFlagsRequestParameters,
  Subject,
} from './client/eppo-precomputed-client';
import FlagConfigRequestor from './configuration-requestor';
import {
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
} from './configuration-store/configuration-store';
import { HybridConfigurationStore } from './configuration-store/hybrid.store';
import { MemoryStore, MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import {
  IConfigurationWire,
  IObfuscatedPrecomputedConfigurationResponse,
  IPrecomputedConfigurationResponse,
} from './configuration-wire-types';
import * as constants from './constants';
import { decodePrecomputedFlag } from './decoding';
import BatchEventProcessor from './events/batch-event-processor';
import { BoundedEventQueue } from './events/bounded-event-queue';
import DefaultEventDispatcher, {
  DEFAULT_EVENT_DISPATCHER_CONFIG,
  DEFAULT_EVENT_DISPATCHER_BATCH_SIZE,
  newDefaultEventDispatcher,
} from './events/default-event-dispatcher';
import Event from './events/event';
import EventDispatcher from './events/event-dispatcher';
import NamedEventQueue from './events/named-event-queue';
import NetworkStatusListener from './events/network-status-listener';
import HttpClient from './http-client';
import {
  PrecomputedFlag,
  Flag,
  ObfuscatedFlag,
  VariationType,
  FormatEnum,
  BanditParameters,
  BanditVariation,
  IObfuscatedPrecomputedBandit,
  Variation,
  Environment,
} from './interfaces';
import { buildStorageKeySuffix } from './obfuscation';
import {
  AttributeType,
  Attributes,
  BanditActions,
  BanditSubjectAttributes,
  ContextAttributes,
  FlagKey,
} from './types';
import * as validation from './validation';

export {
  loggerPrefix,
  applicationLogger,
  AbstractAssignmentCache,
  IAssignmentDetails,
  IAssignmentHooks,
  IAssignmentLogger,
  IAssignmentEvent,
  IBanditLogger,
  IBanditEvent,
  IContainerExperiment,
  EppoClientParameters,
  EppoClient,
  constants,
  ApiEndpoints,
  FlagConfigRequestor,
  HttpClient,
  validation,

  // Precomputed Client
  EppoPrecomputedClient,
  PrecomputedFlagsRequestParameters,
  IObfuscatedPrecomputedConfigurationResponse,
  IObfuscatedPrecomputedBandit,

  // Configuration store
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
  MemoryStore,
  HybridConfigurationStore,
  MemoryOnlyConfigurationStore,

  // Assignment cache
  AssignmentCacheKey,
  AssignmentCacheValue,
  AssignmentCacheEntry,
  AssignmentCache,
  AsyncMap,
  NonExpiringInMemoryAssignmentCache,
  LRUInMemoryAssignmentCache,
  assignmentCacheKeyToString,
  assignmentCacheValueToString,

  // Interfaces
  FlagConfigurationRequestParameters,
  Flag,
  ObfuscatedFlag,
  Variation,
  VariationType,
  AttributeType,
  Attributes,
  ContextAttributes,
  BanditSubjectAttributes,
  BanditActions,
  BanditVariation,
  BanditParameters,
  Subject,
  Environment,
  FormatEnum,

  // event dispatcher types
  NamedEventQueue,
  EventDispatcher,
  BoundedEventQueue,
  DEFAULT_EVENT_DISPATCHER_CONFIG,
  DEFAULT_EVENT_DISPATCHER_BATCH_SIZE,
  newDefaultEventDispatcher,
  BatchEventProcessor,
  NetworkStatusListener,
  DefaultEventDispatcher,
  Event,

  // Configuration interchange.
  IConfigurationWire,
  IPrecomputedConfigurationResponse,
  PrecomputedFlag,
  FlagKey,

  // Test helpers
  decodePrecomputedFlag,

  // Utilities
  buildStorageKeySuffix,
};
