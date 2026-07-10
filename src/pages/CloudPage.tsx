import { Button, Tag } from "antd";
import { ArrowsClockwise, Database, Files, ShieldCheck, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { XsIconTile, XsStatusBar } from "@/components/xs";
import cloudDriveIcon from "@/assets/cloud-icons/cloud-drive.png";
import {
  createMockCloudService,
  type CloudMaterialStatus,
  type CloudOperationUpdate,
  type CloudService
} from "@/services/cloudService";
import { PageFrame } from "./PageFrame";
import "./styles/cloud.css";

const cloudLanes = [
  { title: "企业文件", meta: "2,346 份资料", desc: "合同、制度、报告统一入库", icon: Files, tone: "blue" as const },
  { title: "知识素材", meta: "189 个条目", desc: "支持问答、写作与分析引用", icon: Database, tone: "cyan" as const },
  { title: "权限校验", meta: "6 个空间", desc: "按部门空间隔离资料范围", icon: ShieldCheck, tone: "green" as const }
];

const statusColor: Record<CloudMaterialStatus, string> = {
  已解析: "cyan",
  待同步: "gold",
  已入库: "blue"
};

type CloudPageProps = {
  service?: CloudService;
};

export function CloudPage({ service }: CloudPageProps = {}) {
  const [cloudService] = useState(() => service ?? createMockCloudService());
  const [snapshot, setSnapshot] = useState(() => cloudService.getSnapshot());
  const [operation, setOperation] = useState<CloudOperationUpdate | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef<number | null>(null);
  const isBusy = activeRequestId !== null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      activeRequestRef.current = null;
      requestSequenceRef.current += 1;
    };
  }, []);

  const beginRequest = (update: CloudOperationUpdate) => {
    if (activeRequestRef.current !== null) {
      return null;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeRequestRef.current = requestId;
    setActiveRequestId(requestId);
    setOperation(update);
    return requestId;
  };

  const isCurrentRequest = (requestId: number) => (
    mountedRef.current && activeRequestRef.current === requestId
  );

  const finishRequest = (requestId: number) => {
    if (activeRequestRef.current !== requestId) {
      return;
    }

    activeRequestRef.current = null;
    if (mountedRef.current) {
      setActiveRequestId(null);
    }
  };

  const observeRequest = (requestId: number) => (update: CloudOperationUpdate) => {
    if (isCurrentRequest(requestId)) {
      setOperation(update);
    }
  };

  const handleCreateUploadTask = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }

    const requestId = beginRequest({
      operation: "upload",
      phase: "pending",
      progress: 0,
      message: `正在准备上传 ${file.name}`
    });
    if (requestId === null) {
      return;
    }

    try {
      const result = await cloudService.uploadFile(file, observeRequest(requestId));
      if (isCurrentRequest(requestId)) {
        if (result.ok) {
          setSnapshot(result.snapshot);
          setOperation({
            operation: "upload",
            phase: "success",
            progress: 100,
            message: `${file.name} 已上传，可继续同步到知识库`
          });
        } else {
          setOperation({
            operation: "upload",
            phase: "error",
            progress: 0,
            message: `${file.name} 上传失败，请重试`
          });
        }
      }
    } catch {
      if (isCurrentRequest(requestId)) {
        setOperation({
          operation: "upload",
          phase: "error",
          progress: 0,
          message: `${file.name} 上传失败，请重试`
        });
      }
    } finally {
      finishRequest(requestId);
    }
  };

  const handleSyncKnowledgeBase = async () => {
    const requestId = beginRequest({
      operation: "sync",
      phase: "pending",
      progress: 0,
      message: "正在检查待同步资料"
    });
    if (requestId === null) {
      return;
    }

    try {
      const result = await cloudService.syncKnowledgeBase(observeRequest(requestId));
      if (isCurrentRequest(requestId)) {
        if (result.ok) {
          setSnapshot(result.snapshot);
          setOperation({
            operation: "sync",
            phase: "success",
            progress: 100,
            message: `知识库已同步，更新时间 ${result.snapshot.lastSyncedAt}`
          });
        } else {
          setOperation({
            operation: "sync",
            phase: "error",
            progress: 0,
            message: "知识库同步失败，请重试"
          });
        }
      }
    } catch {
      if (isCurrentRequest(requestId)) {
        setOperation({
          operation: "sync",
          phase: "error",
          progress: 0,
          message: "知识库同步失败，请重试"
        });
      }
    } finally {
      finishRequest(requestId);
    }
  };

  const handleShowSyncStatus = () => {
    if (activeRequestRef.current !== null) {
      return;
    }

    setOperation({
      operation: "sync",
      phase: "success",
      progress: 100,
      message: `最近同步：${snapshot.lastSyncedAt} · ${snapshot.syncStatus}`
    });
  };

  const statusTone = operation?.phase === "error"
    ? "error"
    : isBusy
      ? "loading"
      : "success";

  return (
    <PageFrame
      title="我的云盘"
      subtitle="统一管理企业文件与智能分析资料"
      actions={(
        <>
          <Button
            disabled={isBusy}
            icon={<ArrowsClockwise size={18} />}
            loading={isBusy && operation?.operation === "sync"}
            onClick={handleSyncKnowledgeBase}
          >
            同步知识库
          </Button>
          <Button
            disabled={isBusy}
            type="primary"
            icon={<UploadSimple size={18} />}
            loading={isBusy && operation?.operation === "upload"}
            onClick={handleCreateUploadTask}
          >
            上传文件
          </Button>
          <input
            ref={uploadInputRef}
            aria-label="选择上传文件"
            type="file"
            hidden
            disabled={isBusy}
            onChange={handleUploadFile}
          />
        </>
      )}
    >
      <section className="xs-card cloud-workbench" aria-label="我的云盘内容">
        <div className="cloud-workbench__intro">
          <XsIconTile imageSrc={cloudDriveIcon} label="我的云盘" tone="cyan" />
          <div>
            <span className="cloud-eyebrow">企业资料工作台</span>
            <h2>资料上传后可用于问数、写作和知识问答</h2>
            <p>按企业文件、知识素材和权限范围组织资料，让常用资料随时可检索、可引用、可追溯。</p>
          </div>
        </div>
        <div className="cloud-workbench__metrics" aria-label="云盘概览指标">
          <div>
            <span>本月新增</span>
            <strong>{snapshot.overview.monthlyAdded}</strong>
          </div>
          <div>
            <span>解析完成率</span>
            <strong>{snapshot.overview.parsedCompletionRate}%</strong>
          </div>
          <div>
            <span>可用空间</span>
            <strong>{snapshot.overview.availableSpaceLabel}</strong>
          </div>
        </div>
      </section>

      <section className="cloud-lane-grid" aria-label="云盘资料分类">
        {cloudLanes.map((lane) => (
          <article className="xs-card cloud-lane" aria-label={`云盘资料：${lane.title}`} key={lane.title}>
            <XsIconTile icon={lane.icon} label={lane.title} tone={lane.tone} />
            <div>
              <h2>{lane.title}</h2>
              <strong>
                {lane.title === "企业文件"
                  ? `${snapshot.overview.enterpriseFileCount.toLocaleString("zh-CN")} 份资料`
                  : lane.meta}
              </strong>
              <p>{lane.desc}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="xs-card cloud-recent" aria-labelledby="cloud-recent-title">
        <div className="section-title-row">
          <h2 id="cloud-recent-title">最近资料</h2>
          <Button
            type="link"
            aria-label="查看同步状态"
            disabled={isBusy}
            onClick={handleShowSyncStatus}
          >
            最近同步：{snapshot.lastSyncedAt}
          </Button>
        </div>
        <div className="cloud-recent__list">
          {snapshot.recentMaterials.map((item) => (
            <div className="cloud-recent__row" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.owner}</span>
              <Tag bordered={false} color={statusColor[item.status]}>
                {item.status}
              </Tag>
            </div>
          ))}
        </div>
      </section>
      <XsStatusBar
        className="cloud-status"
        tone={statusTone}
        label={operation?.operation === "upload" ? "上传" : "同步"}
        message={operation ? (
          <>
            {operation.message}
            {isBusy ? (
              <progress
                aria-label={operation.operation === "upload" ? "文件上传进度" : "知识库同步进度"}
                max={100}
                value={operation.progress}
              >
                {operation.progress}%
              </progress>
            ) : null}
          </>
        ) : ""}
      />
    </PageFrame>
  );
}
