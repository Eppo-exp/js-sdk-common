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
  IAssignmentDetails,
  IContainerExperiment,
} from './client/eppo-client';
import { Subject } from './client/subject';
import FlagConfigRequestor from './configuration-requestor';
import {
  IConfigurationWire,
  IObfuscatedPrecomputedConfigurationResponse,
  IPrecomputedConfigurationResponse,
} from './configuration-wire/configuration-wire-types';
import * as constants from './constants';
import { decodePrecomputedFlag } from './decoding';
import { EppoAssignmentLogger } from './eppo-assignment-logger';
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
import { KVStore, MemoryStore } from './kvstore';
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
  EppoAssignmentLogger,
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
  IObfuscatedPrecomputedConfigurationResponse,
  IObfuscatedPrecomputedBandit,

  // Configuration store
  KVStore,
  MemoryStore,

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
  Subject,
};
