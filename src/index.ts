import ApiEndpoints from './api-endpoints';
import { logger as applicationLogger } from './application-logger';
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
  FlagConfigurationRequestParameters,
  IAssignmentDetails,
  IContainerExperiment,
} from './client/eppo-client';
import EppoPrecomputedClient, {
  PrecomputedFlagsRequestParameters,
} from './client/eppo-precomputed-client';
import FlagConfigRequestor from './configuration-requestor';
import {
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
} from './configuration-store/configuration-store';
import { HybridConfigurationStore } from './configuration-store/hybrid.store';
import { MemoryStore, MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import * as constants from './constants';
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
import { PrecomputedFlag, Flag, ObfuscatedFlag, VariationType } from './interfaces';
import {
  AttributeType,
  Attributes,
  BanditActions,
  BanditSubjectAttributes,
  ContextAttributes,
} from './types';
import * as validation from './validation';

export {
  applicationLogger,
  AbstractAssignmentCache,
  IAssignmentDetails,
  IAssignmentHooks,
  IAssignmentLogger,
  IAssignmentEvent,
  IBanditLogger,
  IBanditEvent,
  IContainerExperiment,
  PrecomputedFlagsRequestParameters,
  EppoClient,
  constants,
  ApiEndpoints,
  FlagConfigRequestor,
  HttpClient,
  validation,
  EppoPrecomputedClient,

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
  PrecomputedFlag,
  VariationType,
  AttributeType,
  Attributes,
  ContextAttributes,
  BanditSubjectAttributes,
  BanditActions,

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
};
