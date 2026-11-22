export interface StreamToolCallTracker {
  seenIds: Map<number, string>;
  idToIndex: Map<string, number>;
  namedIndices: Set<number>;
  lastAssignedIndex: number;
  nextIndex: number;
}

export function createStreamToolCallTracker(): StreamToolCallTracker {
  return {
    seenIds: new Map(),
    idToIndex: new Map(),
    namedIndices: new Set(),
    lastAssignedIndex: 0,
    nextIndex: 0,
  };
}

/**
 * Normalizes tool_calls in streaming deltas:
 * - Assigns sequential indices to unindexed tool calls across parallel calls and sequential chunks
 * - Reuses seen IDs or mints deterministic fallback IDs
 * - Preserves state across multi-chunk tool calls
 */
export function normalizeStreamToolCallIndices(
  toolCalls: any[],
  tracker: StreamToolCallTracker
): boolean {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false;
  let changed = false;

  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") continue;

    if (tc.index !== undefined) {
      tracker.lastAssignedIndex = tc.index;
      tracker.nextIndex = Math.max(tracker.nextIndex, tc.index + 1);
      if (tc.function?.name) tracker.namedIndices.add(tc.index);
      if (typeof tc.id === "string" && tc.id.length > 0) {
        tracker.idToIndex.set(tc.id, tc.index);
        tracker.seenIds.set(tc.index, tc.id);
        continue;
      }
    } else {
      changed = true;
      if (typeof tc.id === "string" && tc.id.length > 0) {
        if (tracker.idToIndex.has(tc.id)) {
          tc.index = tracker.idToIndex.get(tc.id)!;
        } else {
          tc.index = tracker.nextIndex++;
          tracker.idToIndex.set(tc.id, tc.index);
        }
        tracker.seenIds.set(tc.index, tc.id);
        tracker.lastAssignedIndex = tc.index;
        if (tc.function?.name) tracker.namedIndices.add(tc.index);
        continue;
      }

      if (tc.function?.name) {
        if (tracker.namedIndices.has(tracker.lastAssignedIndex)) {
          tc.index = tracker.nextIndex++;
        } else {
          tc.index = tracker.lastAssignedIndex;
          tracker.nextIndex = Math.max(tracker.nextIndex, tc.index + 1);
        }
        tracker.namedIndices.add(tc.index);
        tracker.lastAssignedIndex = tc.index;
      } else {
        tc.index = tracker.lastAssignedIndex;
      }
    }

    // Ensure valid id on this fragment
    const known = tracker.seenIds.get(tc.index);
    const id = known || tc.id || `call_${Math.random().toString(36).slice(2, 11)}`;
    tc.id = id;
    tracker.seenIds.set(tc.index, id);
    tracker.idToIndex.set(id, tc.index);
  }

  return changed;
}
