import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardDesignerIsland } from "@/features/dashboardStudio/DashboardDesignerIsland";
import {
  createBlankDashboard,
  replanLegacyDashboardDraft
} from "@/services/dashboardGenerationService";
import { getBrowserDashboardRepository } from "@/services/dashboardRepositoryService";
import type { DashboardRecord, DashboardSchema } from "@/types/dashboardStudio";

function resolveEditorReturnPath(value: string | null) {
  return value === "/analysis" ? value : "/dashboard";
}

function createStarterRecord() {
  const repository = getBrowserDashboardRepository();
  const schema = createBlankDashboard();
  return repository.saveDraft(schema);
}

export function DashboardEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft");
  const returnPath = resolveEditorReturnPath(searchParams.get("returnTo"));
  const repository = useMemo(() => getBrowserDashboardRepository(), []);
  const starterRecordRef = useRef<DashboardRecord | null>(null);
  const [record, setRecord] = useState<DashboardRecord | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    setLoadError("");
    if (draftId) {
      let savedRecord = repository.get(draftId);
      if (!savedRecord) {
        setRecord(null);
        setLoadError("找不到这份看板草稿，它可能已被删除或来自其他浏览器。");
        return;
      }
      const replannedSchema = replanLegacyDashboardDraft(savedRecord);
      if (replannedSchema) {
        savedRecord = repository.saveDraft(replannedSchema, savedRecord.revision);
      }
      setRecord(savedRecord);
      return;
    }

    const starter = starterRecordRef.current ?? createStarterRecord();
    starterRecordRef.current = starter;
    setRecord(starter);
    navigate(`/dashboard-editor?draft=${encodeURIComponent(starter.id)}`, { replace: true });
  }, [draftId, navigate, repository]);

  const saveDraft = useCallback(
    async (schema: DashboardSchema, expectedRevision: number) => {
      const nextRecord = repository.saveDraft(schema, expectedRevision);
      setRecord(nextRecord);
      return nextRecord;
    },
    [repository]
  );

  const publishDashboard = useCallback(
    async (schema: DashboardSchema, expectedRevision: number) => {
      const savedRecord = repository.saveDraft(schema, expectedRevision);
      const publishedRecord = repository.publish(savedRecord.id, savedRecord.revision);
      setRecord(publishedRecord);
      return publishedRecord;
    },
    [repository]
  );

  if (loadError) {
    return (
      <section className="dashboard-studio-page" aria-label="看板编辑器工作区">
        <h1>看板编辑器</h1>
        <div className="dashboard-studio-page__error" role="alert">
          <strong>看板草稿不可用</strong>
          <p>{loadError}</p>
          <button type="button" onClick={() => navigate("/dashboard-editor", { replace: true })}>
            新建大屏
          </button>
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section className="dashboard-studio-page" aria-label="看板编辑器工作区">
        <h1 className="sr-only">看板编辑器</h1>
        <div className="dashboard-studio-page__loading" role="status">
          正在读取大屏草稿…
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-studio-page" aria-label="看板编辑器工作区">
      <h1 className="sr-only">看板编辑器</h1>
      <DashboardDesignerIsland
        key={record.id}
        record={record}
        saveDraft={saveDraft}
        publishDashboard={publishDashboard}
        onExit={() => navigate(returnPath)}
      />
    </section>
  );
}
