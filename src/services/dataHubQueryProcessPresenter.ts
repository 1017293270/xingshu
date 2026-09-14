import type {
  DataHubActivityData, DataHubCitationDocument, DataHubExecutionProjection,
  DataHubExecutionStatus, DataHubStreamEvent, DataHubTableResult
} from "@/types/dataHub";
import { getDataHubEventPayload, parseDataHubJsonValue } from "./dataHubEventAdapter";
import { normalizeCitationDocument, normalizeDataHubTableResult } from "./dataHubAskDataPresenter";

type ResultBase = { key: string; sessionId?: string; status: DataHubExecutionStatus };
export type DataHubQueryProcessResult = ResultBase & (
  | { kind: "table"; table: DataHubTableResult; dataSource?: string }
  | { kind: "citation" | "document"; document: DataHubCitationDocument; excerpt?: string;
      documentSources?: Array<{ sessionId?: string; document: DataHubCitationDocument }>;
      evidenceSources?: Array<{ sessionId?: string; evidenceId: string; text: string }> }
);
export type DataHubQueryProcess = { results: DataHubQueryProcessResult[]; activity?: DataHubActivityData };

function record(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseDataHubJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function publicText(value: unknown) {
  const valueText = text(value);
  return valueText && !/^[{[]/.test(valueText) ? valueText : undefined;
}

/** A result view over the existing event stream; no model prose becomes evidence. */
export function buildDataHubQueryProcess(
  projection: DataHubExecutionProjection, events: readonly DataHubStreamEvent[]
): DataHubQueryProcess {
  const main = projection.mainSession;
  const sessions = [main, ...projection.subagentSessions];
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  const scopedEvents = events.filter((event) =>
    (!event.chatId || !main.chatId || event.chatId === main.chatId)
    && (!event.globalSessionId || !main.globalSessionId || event.globalSessionId === main.globalSessionId)
    && (!event.sessionId || byId.has(event.sessionId)));
  const sources = scopedEvents.flatMap((event) => {
    if (event.type !== "data_source_selected") return [];
    const data = record(getDataHubEventPayload(event));
    const name = text(data?.datasourceName);
    const id = data?.datasourceId;
    return name && (typeof id === "number" || typeof id === "string")
      ? [{ id: String(id), name, sessionId: event.sessionId ?? main.sessionId }] : [];
  });
  function isDescendant(id: string | undefined, ancestor: string | undefined) {
    const visited = new Set<string | undefined>();
    while (!visited.has(id)) {
      if (id === ancestor) return true;
      visited.add(id);
      const parent = byId.get(id)?.parentSessionId;
      if (!parent) return false;
      id = parent;
    }
    return false;
  }
  function dataSource(table: DataHubTableResult, sessionId: string | undefined) {
    const matching = table.datasourceId !== undefined
      ? sources.filter((source) => source.id === String(table.datasourceId))
      : sources.filter((source) => isDescendant(source.sessionId, sessionId));
    const identities = new Set(matching.map((source) => source.id));
    const names = new Set(matching.map((source) => source.name));
    return identities.size === 1 && names.size === 1 ? matching[0].name : undefined;
  }

  const output: DataHubQueryProcess = { results: [] };
  const documents = new Map<string, Extract<DataHubQueryProcessResult, { kind: "citation" | "document" }>>();
  const unavailableDocuments = new Set<string>();
  const seenEvents = new Set<string>();
  let tableIndex = 0;
  scopedEvents.forEach((event, index) => {
    const sessionId = event.sessionId ?? main.sessionId;
    const session = byId.get(sessionId) ?? main;
    const identity = event.eventId !== undefined ? `id:${event.eventId}`
      : event.sequence !== undefined ? `seq:${event.sequence}` : undefined;
    const eventKey = `${sessionId ?? "root"}:${identity ?? `index:${index}`}`;
    if (identity && seenEvents.has(eventKey)) return;
    if (identity) seenEvents.add(eventKey);
    const payload = getDataHubEventPayload(event);
    const data = record(payload);
    if (event.type === "table") {
      const table = normalizeDataHubTableResult(payload, tableIndex);
      if (table) {
        output.results.push({ key: `table:${eventKey}`, kind: "table", sessionId,
          status: session.status, table, dataSource: dataSource(table, sessionId) });
        tableIndex += 1;
      }
    }
    if (event.type === "activity" && data?.kind === "tool"
      && text(data.activityId) && text(data.action) && publicText(data.label)
      && ["running", "success", "warning", "failed", "cancelled"].includes(String(data.status))) {
      output.activity = {
        activityId: text(data.activityId)!, kind: "tool", action: text(data.action)!,
        label: publicText(data.label)!, status: data.status as DataHubActivityData["status"],
        summary: publicText(data.summary), startedAt: text(data.startedAt) ?? "",
        completedAt: text(data.completedAt),
        durationMs: typeof data.durationMs === "number" ? data.durationMs : undefined
      };
    }
    function appendDocument(kind: "citation" | "document", raw: unknown) {
      const document = normalizeCitationDocument(raw);
      if (!document) return;
      const key = `${kind}:${JSON.stringify([document.kbId, document.docId])}`;
      if (record(raw)?.sourceAvailable === false) unavailableDocuments.add(key);
      const previous = documents.get(key);
      const evidenceSources = (document.evidenceFragments ?? []).map((evidence) => ({ ...evidence, sessionId }));
      if (previous) {
        // Confirmation is a result status; a later failure belongs to the overall task.
        previous.status = "done";
        const previousDocuments = previous.documentSources ?? [];
        if (!previousDocuments.some((source) => source.sessionId === sessionId
          && JSON.stringify(source.document) === JSON.stringify(document))) {
          previous.documentSources = [...previousDocuments, { sessionId, document: { ...document } }];
        }
        for (const field of ["docKey", "docName", "fileName", "kbName", "chapter", "pageNumber"] as const) {
          previous.document[field] ||= document[field];
        }
        previous.document.sourceAvailable = !unavailableDocuments.has(key)
          && (previous.document.sourceAvailable || document.sourceAvailable);
        previous.document.markdownAvailable = previous.document.markdownAvailable === false || document.markdownAvailable === false
          ? false : previous.document.markdownAvailable ?? document.markdownAvailable;
        previous.document.fragments = [...new Set([...previous.document.fragments, ...document.fragments])];
        const evidence = previous.document.evidenceFragments ?? [];
        previous.document.evidenceFragments = [...evidence, ...(document.evidenceFragments ?? [])
          .filter((item) => !evidence.some((known) => known.evidenceId === item.evidenceId && known.text === item.text))];
        const previousSources = previous.evidenceSources ?? [];
        previous.evidenceSources = [...previousSources, ...evidenceSources.filter((item) => !previousSources.some((known) =>
          known.evidenceId === item.evidenceId && known.text === item.text
          && (known.sessionId === item.sessionId || event.type === "done" && sessionId === main.sessionId)))];
        previous.excerpt ??= document.fragments[0] ?? publicText(record(raw)?.excerpt ?? record(raw)?.snippet);
        return;
      }
      const result: Extract<DataHubQueryProcessResult, { kind: "citation" | "document" }> = {
        key, kind, document, sessionId, status: "done", evidenceSources,
        documentSources: [{ sessionId, document: { ...document } }],
        excerpt: document.fragments[0] ?? publicText(record(raw)?.excerpt ?? record(raw)?.snippet)
      };
      documents.set(key, result);
      output.results.push(result);
    }
    if (event.type === "citation_document") appendDocument("citation", payload);
    if (event.type === "document_url") appendDocument("document", payload);
    if (event.type === "done" && data) {
      if (Array.isArray(data.citationDocuments)) data.citationDocuments.forEach((item) => appendDocument("citation", item));
      if (data.documentLookup === true && data.failed !== true
        && data.documentSelectionMode !== "none" && data.documentSelectionMode !== "uncertain"
        && Array.isArray(data.documentResults)) {
        data.documentResults.forEach((item) => appendDocument("document", item));
      }
    }
  });
  return output;
}
