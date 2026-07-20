import type { DataHubAskTurn } from "@/types/dataHub";
import type { DashboardDataMode } from "@/types/dashboardStudio";
import { createDashboardDraftFromAskTurn } from "./dashboardGenerationService";
import {
  getBrowserDashboardRepository,
  type DashboardRepository
} from "./dashboardRepositoryService";

type PrepareDashboardFromAskTurnOptions = {
  repository?: DashboardRepository;
  sourceQueryId?: string;
  spaceId?: number;
  dataMode?: DashboardDataMode;
  idFactory?: (prefix: string) => string;
  now?: Date;
};

/**
 * Stable integration point for the ask-data UI.
 *
 * The ask-data page owns only the user action and navigation. This adapter owns
 * schema generation and persistence, and intentionally ignores SQL/tool payloads.
 */
export function prepareDashboardFromAskTurn(
  turn: DataHubAskTurn,
  options: PrepareDashboardFromAskTurnOptions = {}
) {
  const repository = options.repository ?? getBrowserDashboardRepository();
  const schema = createDashboardDraftFromAskTurn(turn, {
    sourceQueryId: options.sourceQueryId,
    spaceId: options.spaceId,
    dataMode: options.dataMode,
    idFactory: options.idFactory,
    now: options.now
  });
  const record = repository.saveDraft(schema);

  return {
    record,
    editorPath: `/dashboard-editor?draft=${encodeURIComponent(record.id)}&returnTo=${encodeURIComponent("/analysis")}`
  };
}
