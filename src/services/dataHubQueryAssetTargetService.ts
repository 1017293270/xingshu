import { getDataHubEventPayload } from "@/services/dataHubEventAdapter";
import type {
  AskArtifactRef,
  DataHubExecutionProjection,
  DataHubExecutionSession
} from "@/types/dataHub";

type UnknownRecord = Record<string, unknown>;

export type DataHubQueryAssetTarget = {
  key: string;
  label: string;
  rootSessionId?: string;
  sessionId?: string;
  chatId?: string;
  artifact?: AskArtifactRef;
  tableCount: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeArtifact(value: unknown): AskArtifactRef | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const askRunId = optionalString(value.askRunId);
  const resolvedQuestion = optionalString(value.resolvedQuestion);
  if (!askRunId || !resolvedQuestion || value.canFavorite !== true) {
    return undefined;
  }

  return {
    askRunId,
    resolvedQuestion,
    canFavorite: true
  };
}

function findEmbeddedArtifact(value: unknown): AskArtifactRef | undefined {
  const direct = normalizeArtifact(value);
  if (direct || !isRecord(value)) {
    return direct;
  }

  for (const key of ["askArtifact", "queryArtifact", "artifact"] as const) {
    const artifact = normalizeArtifact(value[key]);
    if (artifact) {
      return artifact;
    }
  }

  return undefined;
}

function findSessionArtifact(session: DataHubExecutionSession): AskArtifactRef | undefined {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index];
    if (event.type !== "ask_artifact" && event.type !== "done") {
      continue;
    }

    const artifact = findEmbeddedArtifact(getDataHubEventPayload(event));
    if (artifact) {
      return artifact;
    }
  }

  return undefined;
}

function createTarget(
  session: DataHubExecutionSession,
  fallbackQuestion: string
): DataHubQueryAssetTarget | undefined {
  const artifact = findSessionArtifact(session);
  const tableCount = session.tableResults.length;
  const rootSessionId = session.globalSessionId || session.sessionId;
  const canBackfill = Boolean(
    tableCount > 0 && rootSessionId && session.sessionId && session.chatId
  );

  if (!artifact && !canBackfill) {
    return undefined;
  }

  const identity = artifact?.askRunId || session.sessionId;
  if (!identity) {
    return undefined;
  }

  return {
    key: artifact ? `ask:${artifact.askRunId}` : `session:${identity}`,
    label:
      artifact?.resolvedQuestion ||
      session.label ||
      session.agentName ||
      fallbackQuestion,
    rootSessionId,
    sessionId: session.sessionId,
    chatId: session.chatId,
    artifact,
    tableCount
  };
}

/**
 * Resolves the query assets that can be saved from the canonical execution
 * projection. In orchestration mode child data sessions are authoritative;
 * a root table is only used when no child session produced a data result.
 */
export function getDataHubQueryAssetTargets(
  projection: DataHubExecutionProjection,
  fallbackQuestion: string
): DataHubQueryAssetTarget[] {
  const childTargets = projection.subagentSessions
    .map((session) => createTarget(session, fallbackQuestion))
    .filter((target): target is DataHubQueryAssetTarget => Boolean(target));
  const mainTarget = createTarget(projection.mainSession, fallbackQuestion);
  const orderedTargets =
    childTargets.length > 0
      ? [
          ...childTargets,
          ...(mainTarget?.artifact ? [mainTarget] : [])
        ]
      : mainTarget
        ? [mainTarget]
        : [];
  const seen = new Set<string>();

  return orderedTargets.filter((target) => {
    const dedupeKey = target.artifact?.askRunId || target.key;
    if (seen.has(dedupeKey)) {
      return false;
    }
    seen.add(dedupeKey);
    return true;
  });
}
