import { XsAppCard, type XsAppCardData, XsCommandBox } from "@/components/xs";
import {
  ChartLineUp,
  ChatCircleDots,
  FileText,
  ListChecks,
  PencilSimpleLine,
  PresentationChart,
  SquaresFour
} from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import homeWaveBg from "@/assets/home/xingshu-home-wave-bg-image2.webp";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { streamAgentMessage } from "@/services/agentService";
import { createAttachmentQueue } from "@/services/attachmentService";
import { useUiStore } from "@/stores/uiStore";
import "./home.css";

const recommendedApps: XsAppCardData[] = [
  {
    id: "data-chat",
    title: "智能问数",
    description: "经营指标、趋势变化和数据洞察",
    prompt: "帮我分析本月经营数据，并生成趋势图表",
    routeTo: "/analysis",
    icon: ChartLineUp
  },
  {
    id: "knowledge",
    title: "知识问答",
    description: "制度、合同和企业知识快速检索",
    prompt: "帮我查询最新销售政策中的重点变化",
    routeTo: "/analysis",
    icon: ChatCircleDots
  },
  {
    id: "document",
    title: "文档助手",
    description: "读取文档并提炼关键结论",
    prompt: "帮我总结这份项目材料的关键风险",
    routeTo: "/cloud",
    icon: FileText
  },
  {
    id: "report",
    title: "报表生成",
    description: "生成可复用的分析报表和图表",
    prompt: "根据销售数据生成一份周报",
    routeTo: "/dashboard",
    icon: PresentationChart
  },
  {
    id: "writing",
    title: "智能写作",
    description: "报告总结、方案策划与工作汇报",
    prompt: "帮我写一份经营分析汇报提纲",
    routeTo: "/writing",
    icon: PencilSimpleLine
  },
  {
    id: "meeting",
    title: "会议纪要",
    description: "提炼议题、结论和待办事项",
    prompt: "帮我整理今天会议的纪要和行动项",
    routeTo: "/writing",
    icon: ListChecks
  },
  {
    id: "more-apps",
    title: "更多应用",
    description: "打开更多企业智能能力",
    prompt: "帮我打开更多企业智能应用",
    routeTo: "/data-dashboard",
    icon: SquaresFour
  }
];

export function HomePage() {
  const navigate = useNavigate();
  const draft = useUiStore((state) => state.homeDraft);
  const selectedAppId = useUiStore((state) => state.selectedAppId);
  const sentStatus = useUiStore((state) => state.sentStatus);
  const pendingAttachments = useUiStore((state) => state.pendingAttachments);
  const setDraft = useUiStore((state) => state.setHomeDraft);
  const selectApp = useUiStore((state) => state.selectApp);
  const setSentStatus = useUiStore((state) => state.setSentStatus);
  const startAskDataRun = useUiStore((state) => state.startAskDataRun);
  const appendAskDataEvent = useUiStore((state) => state.appendAskDataEvent);
  const completeAskDataRun = useUiStore((state) => state.completeAskDataRun);
  const failAskDataRun = useUiStore((state) => state.failAskDataRun);
  const bindAskDataController = useUiStore((state) => state.bindAskDataController);
  const queuePendingAttachments = useUiStore((state) => state.queuePendingAttachments);
  const removePendingAttachment = useUiStore((state) => state.removePendingAttachment);
  const voiceInput = useVoiceInput({
    onAudioReady: () => setSentStatus("语音录入完成；转写服务尚未接入"),
    onError: setSentStatus
  });

  function startDataHubAskData(question: string) {
    const runId = startAskDataRun(question, null);

    if (import.meta.env.MODE === "test") {
      completeAskDataRun(runId);
      return;
    }

    const controller = streamAgentMessage(
      { content: question },
      {
        onEvent: (event) => {
          appendAskDataEvent(runId, event);
          if (event.type === "error") {
            const data = event.data as { message?: string } | string | undefined;
            failAskDataRun(runId, typeof data === "string" ? data : data?.message || "问数执行失败");
          }
        },
        onDone: () => completeAskDataRun(runId),
        onError: (error) => failAskDataRun(runId, error.message)
      }
    );
    bindAskDataController(runId, controller);
  }

  function handleAttachments(files: File[]) {
    const queue = createAttachmentQueue(files);
    const ready = queue.filter((item) => item.status === "ready");
    const rejected = queue.filter((item) => item.status === "rejected");
    queuePendingAttachments(queue);

    if (rejected.length > 0) {
      setSentStatus(
        ready.length > 0
          ? `${ready.length} 个附件已加入本地队列；${rejected[0].name}：${rejected[0].error}`
          : `${rejected[0].name}：${rejected[0].error}`
      );
      return;
    }

    setSentStatus(`${ready.length} 个附件已加入本地队列，尚未上传`);
  }

  function handleSelectApp(app: XsAppCardData) {
    selectApp(app.id, app.prompt);
    setSentStatus(`已选择：${app.title}`);
  }

  function handleOpenApp(app: XsAppCardData) {
    selectApp(app.id, app.prompt);
    setSentStatus(`正在打开：${app.title}`);

    if (app.routeTo === "/analysis") {
      startDataHubAskData(app.prompt);
    }

    if (app.routeTo) {
      navigate(app.routeTo);
    }
  }

  async function handleSubmit() {
    const command = draft.trim();
    if (!command) {
      return;
    }
    startDataHubAskData(command);
    navigate("/analysis");
  }

  return (
    <div className="home-page">
      <img className="home-page__bg" src={homeWaveBg} alt="" aria-hidden="true" />
      <section className="home-page__hero" aria-labelledby="home-greeting">
        <h1 id="home-greeting">您好，张三</h1>
        <p>我是您的数据管家，有什么可以帮您？</p>
      </section>

      <XsCommandBox
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        onAttach={handleAttachments}
        attachments={pendingAttachments}
        onRemoveAttachment={removePendingAttachment}
        onVoice={() => {
          setSentStatus(voiceInput.state === "recording" ? "正在结束语音录入" : "正在准备语音输入");
          voiceInput.toggle();
        }}
        onCancelVoice={() => {
          voiceInput.cancel();
          setSentStatus("已取消语音输入");
        }}
        voiceState={voiceInput.state}
      />

      {sentStatus ? (
        <div className="home-page__status" role="status">
          {sentStatus}
        </div>
      ) : null}

      <section className="home-page__apps" aria-labelledby="home-apps-title">
        <h2 id="home-apps-title">推荐应用</h2>
        <div className="home-page__app-grid">
          {recommendedApps.map((app) => (
            <XsAppCard
              app={app}
              key={app.id}
              selected={selectedAppId === app.id}
              onSelect={handleSelectApp}
              onOpen={handleOpenApp}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
