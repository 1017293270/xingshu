import { XsAppCard, type XsAppCardData } from "@/components/xs/XsAppCard";
import { XsCommandBox } from "@/components/xs/XsCommandBox";
import { getXsCommandModelMeta } from "@/components/xs/XsCommandModelSelect";
import { useNavigate } from "react-router";
import appDataChatIcon from "@/assets/generated-icons/app-data-chat.png";
import appDocumentAssistantIcon from "@/assets/generated-icons/app-document-assistant.png";
import appKnowledgeQaIcon from "@/assets/generated-icons/app-knowledge-qa.png";
import appMeetingMinutesIcon from "@/assets/generated-icons/app-meeting-minutes.png";
import appMoreAppsIcon from "@/assets/generated-icons/app-more-apps.png";
import appReportGenerationIcon from "@/assets/generated-icons/app-report-generation.png";
import appWritingIcon from "@/assets/generated-icons/app-writing.png";
import homeWaveBg from "@/assets/home/xingshu-home-wave-bg-image2.webp";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { streamAgentMessage } from "@/services/agentService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";
import type { DataHubChatMode } from "@/types/dataHub";
import { useTypingPlaceholder } from "./useTypingPlaceholder";
import "./home.css";

const recommendedApps: XsAppCardData[] = [
  {
    id: "data-chat",
    title: "智能问数",
    description: "经营指标、趋势变化和数据洞察",
    prompt: "帮我分析本月经营数据，并生成趋势图表",
    routeTo: "/ask-data",
    imageSrc: appDataChatIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue"
  },
  {
    id: "knowledge",
    title: "知识问答",
    description: "制度、合同和企业知识快速检索",
    prompt: "帮我查询最新销售政策中的重点变化",
    routeTo: "/ask-knowledge",
    imageSrc: appKnowledgeQaIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "cyan"
  },
  {
    id: "document",
    title: "文档助手",
    description: "读取文档并提炼关键结论",
    prompt: "帮我总结这份项目材料的关键风险",
    routeTo: "/cloud",
    imageSrc: appDocumentAssistantIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "green"
  },
  {
    id: "report",
    title: "报表生成",
    description: "生成可复用的分析报表和图表",
    prompt: "根据销售数据生成一份周报",
    routeTo: "/dashboard",
    imageSrc: appReportGenerationIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "orange"
  },
  {
    id: "writing",
    title: "智能写作",
    description: "报告总结、方案策划与工作汇报",
    prompt: "帮我写一份经营分析汇报提纲",
    routeTo: "/writing",
    imageSrc: appWritingIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "purple"
  },
  {
    id: "meeting",
    title: "会议纪要",
    description: "提炼议题、结论和待办事项",
    prompt: "帮我整理今天会议的纪要和行动项",
    routeTo: "/writing",
    imageSrc: appMeetingMinutesIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue"
  },
  {
    id: "more-apps",
    title: "更多应用",
    description: "打开更多企业智能能力",
    prompt: "帮我打开更多企业智能应用",
    routeTo: "/data-dashboard",
    imageSrc: appMoreAppsIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue"
  }
];

const modelModeByAppId: Partial<Record<string, DataHubChatMode>> = {
  "data-chat": "ask",
  knowledge: "rag"
};

const routeByModelMode: Record<DataHubChatMode, string> = {
  agent: "/ask-agent",
  ask: "/ask-data",
  rag: "/ask-knowledge",
  document_lookup: "/document-lookup"
};

export function HomePage() {
  const navigate = useNavigate();
  const username = useDataHubAuthStore((state) => state.user?.username?.trim() || "用户");
  const draft = useUiStore((state) => state.homeDraft);
  const selectedAppId = useUiStore((state) => state.selectedAppId);
  const homeChatMode = useUiStore((state) => state.homeChatMode);
  const sentStatus = useUiStore((state) => state.sentStatus);
  const setDraft = useUiStore((state) => state.setHomeDraft);
  const setHomeChatMode = useUiStore((state) => state.setHomeChatMode);
  const selectApp = useUiStore((state) => state.selectApp);
  const setSentStatus = useUiStore((state) => state.setSentStatus);
  const startAskDataRun = useUiStore((state) => state.startAskDataRun);
  const appendAskDataEvent = useUiStore((state) => state.appendAskDataEvent);
  const completeAskDataRun = useUiStore((state) => state.completeAskDataRun);
  const failAskDataRun = useUiStore((state) => state.failAskDataRun);
  const bindAskDataController = useUiStore((state) => state.bindAskDataController);
  const voiceInput = useVoiceInput({
    onAudioReady: () => setSentStatus("语音录入完成；转写服务尚未接入"),
    onError: setSentStatus
  });
  const commandPlaceholder = useTypingPlaceholder(!draft.trim());

  function startDataHubConversation(question: string, chatMode: DataHubChatMode) {
    const runId = startAskDataRun(question, null, chatMode);
    const turn = useUiStore.getState().analysisTurns.find((item) => item.id === runId);

    if (import.meta.env.MODE === "test") {
      completeAskDataRun(runId);
      return;
    }

    if (!turn?.sessionId || !turn.chatId) {
      failAskDataRun(runId, `${getXsCommandModelMeta(chatMode).label}会话初始化失败`);
      return;
    }

    const controller = streamAgentMessage(
      {
        content: question,
        sessionId: turn.sessionId,
        globalSessionId: turn.sessionId,
        chatId: turn.chatId,
        chatMode
      },
      {
        onEvent: (event) => {
          appendAskDataEvent(runId, event);
          if (event.type === "error" && !event.parentSessionId) {
            const data = event.data as { message?: string } | string | undefined;
            failAskDataRun(runId, typeof data === "string" ? data : data?.message || "智能编排执行失败");
          }
        },
        onDone: () => completeAskDataRun(runId),
        onError: (error) => failAskDataRun(runId, error.message)
      }
    );
    bindAskDataController(runId, controller);
  }

  function handleOpenApp(app: XsAppCardData) {
    const appModelMode = modelModeByAppId[app.id];
    selectApp(app.id, app.prompt, appModelMode);

    if (appModelMode) {
      setSentStatus("");
      navigate(routeByModelMode[appModelMode]);
      return;
    }

    setSentStatus(`正在打开：${app.title}`);

    if (app.routeTo) {
      navigate(app.routeTo);
    }
  }

  async function handleSubmit() {
    const command = draft.trim();
    if (!command) {
      return;
    }
    startDataHubConversation(command, homeChatMode);
    navigate(routeByModelMode[homeChatMode]);
  }

  return (
    <div className="home-page">
      <img className="home-page__bg" src={homeWaveBg} alt="" aria-hidden="true" />
      <section className="home-page__hero" aria-labelledby="home-greeting">
        <h1 id="home-greeting">您好，<span className="home-page__hero-name">{username}</span></h1>
        <p>我是您的数据管家，有什么可以帮您？</p>
      </section>

      <XsCommandBox
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        submitOnEnter
        placeholder={commandPlaceholder}
        onVoice={() => {
          setSentStatus(voiceInput.state === "recording" ? "正在结束语音录入" : "正在准备语音输入");
          voiceInput.toggle();
        }}
        onCancelVoice={() => {
          voiceInput.cancel();
          setSentStatus("已取消语音输入");
        }}
        voiceState={voiceInput.state}
        modelMode={homeChatMode}
        onModelModeChange={(mode) => {
          setHomeChatMode(mode);
          setSentStatus("");
        }}
      />

      {sentStatus ? (
        <div key={sentStatus} className="home-page__status" role="status">
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
              onOpen={handleOpenApp}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
