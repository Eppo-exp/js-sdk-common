import ApiEndpoints from './api-endpoints';
import { logger as applicationLogger } from './application-logger';
import { IAssignmentHooks } from './assignment-hooks';
import { IAssignmentLogger, IAssignmentEvent } from './assignment-logger';
import { IBanditLogger, IBanditEvent } from './bandit-logger';
import {
  AbstractAssignmentCache,
  AssignmentCache,
  NonExpiringInMemoryAssignmentCache,
  LRUInMemoryAssignmentCache,
  AsyncMap,
  AssignmentCacheKey,
  AssignmentCacheValue,
  AssignmentCacheEntry,
  assignmentCacheKeyToString,
  assignmentCacheValueToString,
} from './cache/abstract-assignment-cache';
import EppoClient, {
  FlagConfigurationRequestParameters,
  IAssignmentDetails,
  IContainerExperiment,
} from './client/eppo-client';
import FlagConfigRequestor from './configuration-requestor';
import {
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
} from './configuration-store/configuration-store';
import { HybridConfigurationStore } from './configuration-store/hybrid.store';
import { MemoryStore, MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import * as constants from './constants';
import HttpClient from './http-client';
import { Flag, ObfuscatedFlag, VariationType } from './interfaces';
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
  EppoClient,
  constants,
  ApiEndpoints,
  FlagConfigRequestor,
  HttpClient,
  validation,

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
  VariationType,
  AttributeType,
  Attributes,
  ContextAttributes,
  BanditSubjectAttributes,
  BanditActions,
};
