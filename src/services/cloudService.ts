import { createAttachmentQueue } from "./attachmentService";

export type CloudMaterialStatus = "已解析" | "待同步" | "已入库";

export type CloudMaterial = {
  id: string;
  name: string;
  owner: string;
  status: CloudMaterialStatus;
  updatedAt: string;
};

export type CloudSnapshot = {
  recentMaterials: CloudMaterial[];
  lastSyncedAt: string;
  syncStatus: "已同步" | "有待同步资料";
  overview: {
    monthlyAdded: number;
    parsedCompletionRate: number;
    availableSpaceLabel: string;
    enterpriseFileCount: number;
  };
};

export type CloudOperation = "upload" | "sync";
export type CloudOperationPhase = "pending" | "progress" | "success" | "error";

export type CloudOperationUpdate = {
  operation: CloudOperation;
  phase: CloudOperationPhase;
  progress: number;
  message: string;
};

export type CloudOperationObserver = (update: CloudOperationUpdate) => void;

export type CloudOperationResult = {
  ok: boolean;
  snapshot: CloudSnapshot;
};

export type CloudService = {
  getSnapshot: () => CloudSnapshot;
  uploadFile: (file: File, observer?: CloudOperationObserver) => Promise<CloudOperationResult>;
  syncKnowledgeBase: (observer?: CloudOperationObserver) => Promise<CloudOperationResult>;
};

type MockCloudServiceOptions = {
  wait?: (durationMs: number) => Promise<void>;
  now?: () => string;
  shouldFail?: (operation: CloudOperation) => boolean;
};

const initialMaterials: CloudMaterial[] = [
  {
    id: "cloud-sales-policy",
    name: "销售政策更新说明.pdf",
    owner: "市场部",
    status: "已解析",
    updatedAt: "今日 13:42"
  },
  {
    id: "cloud-q2-analysis",
    name: "Q2 经营分析附件.xlsx",
    owner: "产品部",
    status: "待同步",
    updatedAt: "今日 11:26"
  },
  {
    id: "cloud-contract-approval",
    name: "合同审批规范.docx",
    owner: "法务部",
    status: "已入库",
    updatedAt: "昨日 17:08"
  }
];

function defaultWait(durationMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });
}

function defaultNow() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function cloneSnapshot(snapshot: CloudSnapshot): CloudSnapshot {
  return {
    ...snapshot,
    overview: { ...snapshot.overview },
    recentMaterials: snapshot.recentMaterials.map((material) => ({ ...material }))
  };
}

export function createMockCloudService(options: MockCloudServiceOptions = {}): CloudService {
  const wait = options.wait ?? defaultWait;
  const now = options.now ?? defaultNow;
  const shouldFail = options.shouldFail ?? (() => false);
  let uploadSequence = 0;
  let snapshot: CloudSnapshot = {
    recentMaterials: initialMaterials.map((material) => ({ ...material })),
    lastSyncedAt: "今日 14:20",
    syncStatus: "有待同步资料",
    overview: {
      monthlyAdded: 86,
      parsedCompletionRate: 94,
      availableSpaceLabel: "6 GB",
      enterpriseFileCount: 2346
    }
  };

  const getSnapshot = () => cloneSnapshot(snapshot);

  const emit = (
    observer: CloudOperationObserver | undefined,
    update: CloudOperationUpdate
  ) => observer?.(update);

  const uploadFile: CloudService["uploadFile"] = async (file, observer) => {
    const attachment = createAttachmentQueue([file])[0];
    if (!attachment || attachment.status === "rejected") {
      emit(observer, {
        operation: "upload",
        phase: "error",
        progress: 0,
        message: attachment ? `${attachment.name}：${attachment.error}` : "请选择要上传的文件"
      });
      return { ok: false, snapshot: getSnapshot() };
    }

    emit(observer, {
      operation: "upload",
      phase: "pending",
      progress: 0,
      message: `正在准备上传 ${attachment.name}`
    });
    await wait(90);
    emit(observer, {
      operation: "upload",
      phase: "progress",
      progress: 36,
      message: `正在上传 ${attachment.name}（36%）`
    });
    await wait(110);

    if (shouldFail("upload")) {
      emit(observer, {
        operation: "upload",
        phase: "error",
        progress: 36,
        message: `${attachment.name} 上传失败，请重试`
      });
      return { ok: false, snapshot: getSnapshot() };
    }

    emit(observer, {
      operation: "upload",
      phase: "progress",
      progress: 78,
      message: `正在登记 ${attachment.name}（78%）`
    });
    await wait(80);

    uploadSequence += 1;
    const uploadedAt = now();
    snapshot = {
      ...snapshot,
      syncStatus: "有待同步资料",
      overview: {
        ...snapshot.overview,
        monthlyAdded: snapshot.overview.monthlyAdded + 1,
        enterpriseFileCount: snapshot.overview.enterpriseFileCount + 1
      },
      recentMaterials: [
        {
          id: `${attachment.id}-${uploadSequence}`,
          name: attachment.name,
          owner: "当前用户",
          status: "待同步",
          updatedAt: uploadedAt
        },
        ...snapshot.recentMaterials
      ]
    };
    emit(observer, {
      operation: "upload",
      phase: "success",
      progress: 100,
      message: `${attachment.name} 已上传，可继续同步到知识库`
    });

    return { ok: true, snapshot: getSnapshot() };
  };

  const syncKnowledgeBase: CloudService["syncKnowledgeBase"] = async (observer) => {
    emit(observer, {
      operation: "sync",
      phase: "pending",
      progress: 0,
      message: "正在检查待同步资料"
    });
    await wait(90);
    emit(observer, {
      operation: "sync",
      phase: "progress",
      progress: 36,
      message: "正在同步知识库（36%）"
    });
    await wait(110);

    if (shouldFail("sync")) {
      emit(observer, {
        operation: "sync",
        phase: "error",
        progress: 36,
        message: "知识库同步失败，请重试"
      });
      return { ok: false, snapshot: getSnapshot() };
    }

    emit(observer, {
      operation: "sync",
      phase: "progress",
      progress: 78,
      message: "正在更新资料状态（78%）"
    });
    await wait(80);

    const syncedAt = now();
    snapshot = {
      lastSyncedAt: syncedAt,
      syncStatus: "已同步",
      overview: { ...snapshot.overview },
      recentMaterials: snapshot.recentMaterials.map((material) =>
        material.status === "待同步"
          ? { ...material, status: "已入库", updatedAt: syncedAt }
          : material
      )
    };
    emit(observer, {
      operation: "sync",
      phase: "success",
      progress: 100,
      message: `知识库已同步，更新时间 ${syncedAt}`
    });

    return { ok: true, snapshot: getSnapshot() };
  };

  return { getSnapshot, uploadFile, syncKnowledgeBase };
}
