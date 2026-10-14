import { IAssignmentEvent } from '../assignment-logger';
import { AssignmentCache } from '../cache/abstract-assignment-cache';

/** Pending events take precedence over the last successfully logged assignment. */
export function hasLoggedOrQueuedAssignment(
  cache: AssignmentCache | undefined,
  event: IAssignmentEvent,
  queue: Iterable<IAssignmentEvent>,
): boolean {
  if (!cache || !event.allocation || !event.variation) {
    return false;
  }
  let lastQueued: IAssignmentEvent | undefined;
  for (const queued of queue) {
    if (queued.subject === event.subject && queued.featureFlag === event.featureFlag) {
      lastQueued = queued;
    }
  }
  if (lastQueued) {
    return lastQueued.allocation === event.allocation && lastQueued.variation === event.variation;
  }
  return cache.has({
    flagKey: event.featureFlag,
    subjectKey: event.subject,
    allocationKey: event.allocation,
    variationKey: event.variation,
  });
}

/** Cache only after the assignment logger accepts the event. */
export function cacheLoggedAssignment(cache: AssignmentCache | undefined, event: IAssignmentEvent) {
  cache?.set({
    flagKey: event.featureFlag,
    subjectKey: event.subject,
    allocationKey: event.allocation ?? '__eppo_no_allocation',
    variationKey: event.variation ?? '__eppo_no_variation',
  });
}
