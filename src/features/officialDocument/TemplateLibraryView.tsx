import { FileDoc, UploadSimple } from "@phosphor-icons/react";
import { Button } from "antd";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { XsAsyncPanel } from "@/components/xs/XsAsyncPanel";
import { XsStatusBar, type XsStatusTone } from "@/components/xs/XsStatusBar";
import { XsUploadDialog } from "@/components/xs/XsUploadDialog";
import { uploadOfficialDocumentTemplate } from "@/services/officialDocumentService";
import type { OfficialDocumentTemplate } from "@/types/officialDocument";
import { useUpdateOfficialDocumentWorkspaceCache } from "./officialDocumentMeta";
import { OfficialDocumentAppActions, useOfficialDocumentAppChrome } from "./OfficialDocumentAppShell";
import { TemplateGallery } from "./TemplateGallery";
import { useOfficialDocumentWorkspace } from "./useOfficialDocumentWorkspace";
import "./official-document-workspace.css";

export function TemplateLibraryView() {
  const navigate = useNavigate();
  const location = useLocation();
  useOfficialDocumentAppChrome({ stage: "library", context: "模板库" });
  const updateWorkspaceCache = useUpdateOfficialDocumentWorkspaceCache();
  const { query, status } = useOfficialDocumentWorkspace();
  const [uploadOpen, setUploadOpen] = useState(false);

  const routeState = location.state as { notice?: string; noticeTone?: XsStatusTone } | null;
  const operationStatus = routeState?.notice ?? "";
  const operationTone: XsStatusTone = routeState?.noticeTone ?? "info";
  const templates = query.data?.templates ?? [];

  const handleUploadClick = () => {
    setUploadOpen(true);
  };

  // 失败时把错误抛回弹窗：弹窗保持打开、就地显示原因，用户换个文件就能重试。
  const handleUpload = async (file: File) => {
    const result = await uploadOfficialDocumentTemplate(file);
    updateWorkspaceCache((current) => ({
      ...current,
      templates: [result.template, ...current.templates.filter((item) => item.id !== result.template.id)]
    }));
    navigate(`/writing/templates/${result.template.id}`, {
      state: { notice: result.message, noticeTone: result.persisted ? "success" : "warning" }
    });
  };

  /* 独立页选中模板同样是「这一轮用它写」，所以带着模板 id 回写作台。 */
  const handleUse = (template: OfficialDocumentTemplate) => {
    navigate("/writing", { state: { useTemplateId: template.id } });
  };

  return (
    <section className="official-document-view official-document-template-library" aria-label="结构模板库">
      <OfficialDocumentAppActions>
        <Button type="primary" icon={<UploadSimple size={17} />} onClick={handleUploadClick}>
          上传结构 DOCX
        </Button>
      </OfficialDocumentAppActions>

      {operationStatus ? (
        <XsStatusBar
          tone={operationTone}
          message={operationStatus}
          transitionKey={`${operationTone}:${operationStatus}`}
        />
      ) : null}

      <XsAsyncPanel
        status={status}
        empty={templates.length === 0}
        emptyTitle="还没有可用的结构模板"
        emptyDescription="上传一份结构 DOCX，分析、校准并发布版本。"
        emptyActionLabel="上传结构 DOCX"
        onEmptyAction={handleUploadClick}
        errorTitle="结构模板不可用"
        error={query.error instanceof Error ? query.error.message : "无法加载结构模板。"}
        onRetry={() => void query.refetch()}
        loadingVariant="rows"
        contentKey={query.dataUpdatedAt}
      >
        <TemplateGallery
          label="结构模板列表"
          templates={templates}
          empty={(
            <div className="official-document-inline-empty">
              <FileDoc size={22} aria-hidden="true" />
              当前还没有结构模板。
            </div>
          )}
          onUse={handleUse}
          onOpen={(template) => navigate(`/writing/templates/${template.id}`)}
        />
      </XsAsyncPanel>

      <XsUploadDialog
        open={uploadOpen}
        title="上传结构 DOCX"
        description="上传后自动做安全检查和结构分析；示例文字只用于识别结构。"
        accept={[".docx"]}
        acceptMimeTypes={["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}
        maxBytes={25 * 1024 * 1024}
        submitLabel="上传并分析"
        hint="结构角色与问数槽位可在发布前校准"
        inputTestId="official-document-template-file"
        onUpload={handleUpload}
        onClose={() => setUploadOpen(false)}
      />
    </section>
  );
}
