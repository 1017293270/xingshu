import { XsAppCard, type XsAppCardData } from "@/components/xs/XsAppCard";
import { XsCommandBox } from "@/components/xs/XsCommandBox";
import { getXsCommandModelMeta } from "@/components/xs/XsCommandModelSelect";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionQueryScope } from "@/app/sessionQuery";
import appDataChatIcon from "@/assets/generated-icons/app-data-chat.png";
import appDocumentAssistantIcon from "@/assets/generated-icons/app-document-assistant.png";
import appKnowledgeQaIcon from "@/assets/generated-icons/app-knowledge-qa.png";
import appMeetingMinutesIcon from "@/assets/generated-icons/app-meeting-minutes.png";
import appReportGenerationIcon from "@/assets/generated-icons/app-report-generation.png";
import appWritingIcon from "@/assets/generated-icons/app-writing.png";
import homeWaveBg from "@/assets/home/xingshu-home-wave-bg-image2.webp";
import smartDashboardIcon from "@/assets/icon-kit/xingshu-image2-v1/icon-business-dashboard.png";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { streamAgentMessage } from "@/services/agentService";
import { invalidateDataAssetOverview } from "@/services/dataAssetService";
import { appendVoiceTranscript, transcribeVoice } from "@/services/voiceTranscriptionService";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { useUiStore } from "@/stores/uiStore";
import type { DataHubChatMode } from "@/types/dataHub";
import "./home.css";

type RecommendedApp = XsAppCardData & {
  chatMode?: DataHubChatMode;
  stayOnHome?: boolean;
  comingSoon?: boolean;
};

const recommendedApps: RecommendedApp[] = [
  {
    id: "data-chat",
    title: "智能问数",
    description: "经营指标、趋势变化和数据洞察",
    prompt: "帮我分析本月经营数据，并生成趋势图表",
    imageSrc: appDataChatIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue",
    chatMode: "ask",
    stayOnHome: true
  },
  {
    id: "knowledge",
    title: "知识问答",
    description: "制度、合同和企业知识快速检索",
    prompt: "帮我查询最新销售政策中的重点变化",
    imageSrc: appKnowledgeQaIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "cyan",
    chatMode: "rag",
    stayOnHome: true
  },
  {
    id: "document",
    title: "文档助手",
    description: "快速查找文档",
    prompt: "帮我找最新版员工手册",
    imageSrc: appDocumentAssistantIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "green",
    chatMode: "document_lookup",
    stayOnHome: true
  },
  {
    id: "report",
    title: "报表生成",
    description: "快速做好表格",
    prompt: "根据销售数据生成一份周报",
    routeTo: "/table",
    imageSrc: appReportGenerationIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "orange"
  },
  {
    id: "smart-dashboard",
    title: "智享大屏",
    description: "说需求，AI 直接在大屏里生成与修改",
    prompt: "根据收藏问数生成一块经营大屏",
    routeTo: "/dashboard-editor?smart=1",
    imageSrc: smartDashboardIcon,
    imageSource: "xingshu-image2-v1",
    tone: "cyan"
  },
  {
    id: "writing",
    title: "报告智写",
    description: "套用模板对话成稿并绑定问数结果",
    prompt: "从共享模板库创建一份报告",
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
    imageSrc: appMeetingMinutesIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue",
    comingSoon: true
  }
];

const suggestedQuestions: Record<Exclude<DataHubChatMode, "agent">, Array<{ label: string; value: string }>> = {
  ask: [
    { label: "本月经营数据趋势", value: "帮我分析本月经营数据，并生成趋势图表" },
    { label: "华东区销售同比", value: "本月华东区销售额同比增长多少？" },
    { label: "各部门费用占比", value: "各部门费用占比如何？" },
    { label: "库存周转变化", value: "库存周转率有什么变化？" }
  ],
  rag: [
    { label: "销售政策变化", value: "帮我查询最新销售政策中的重点变化" },
    { label: "差旅住宿标准", value: "差旅住宿标准是什么？" },
    { label: "合同审批流程", value: "合同审批流程怎么走？" },
    { label: "报销所需材料", value: "员工报销需要哪些材料？" }
  ],
  document_lookup: [
    { label: "查找销售合同", value: "查找销售合同" },
    { label: "最新采购制度", value: "找最新采购制度" },
    { label: "差旅管理办法", value: "打开差旅管理办法" },
    { label: "供应商准入标准", value: "查找供应商准入标准" }
  ]
};

const commandPlaceholderByMode: Record<DataHubChatMode, string> = {
  agent: "给星数发送消息",
  ask: "帮你查数据",
  rag: "帮你查知识",
  document_lookup: "帮你找文档"
};

const routeByModelMode: Record<DataHubChatMode, string> = {
  agent: "/ask-agent",
  ask: "/ask-data",
  rag: "/ask-knowledge",
  document_lookup: "/document-lookup"
};

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionScope = useSessionQueryScope();
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
    onAudioReady: async (audio, signal) => {
      setSentStatus("正在转写语音");
      const text = await transcribeVoice(audio, signal);
      if (signal.aborted) {
        return;
      }
      setDraft(appendVoiceTranscript(useUiStore.getState().homeDraft, text));
      setSentStatus("");
    },
    onError: setSentStatus
  });

  const questions = homeChatMode === "agent" ? [] : suggestedQuestions[homeChatMode];

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
        onDone: () => {
          completeAskDataRun(runId);
          void invalidateDataAssetOverview(queryClient, sessionScope);
        },
        onError: (error) => failAskDataRun(runId, error.message)
      }
    );
    bindAskDataController(runId, controller);
  }

  function handleOpenApp(app: RecommendedApp) {
    if (app.comingSoon) {
      setSentStatus("待开放，敬请期待");
      return;
    }

    if (app.stayOnHome && app.chatMode) {
      selectApp(app.id, "", app.chatMode);
      return;
    }

    selectApp(app.id, app.prompt, app.chatMode);
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
        {homeChatMode === "agent" ? (
          <>
            <h1 id="home-greeting">您好，<span className="home-page__hero-name">{username}</span></h1>
            <p>我是您的数据管家，有什么可以帮您？</p>
          </>
        ) : (
          <h1 id="home-greeting">
            {homeChatMode === "ask"
              ? "从一个经营数据问题开始"
              : homeChatMode === "rag"
                ? "从一个企业知识问题开始"
                : "从一份企业文档开始"}
          </h1>
        )}
      </section>

      <XsCommandBox
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        submitOnEnter
        placeholder={commandPlaceholderByMode[homeChatMode]}
        onVoice={() => {
          setSentStatus(voiceInput.state === "recording" ? "正在转写语音" : "正在听取语音");
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

      <XsStatusBar
        slotClassName="home-page__status-slot"
        message={sentStatus}
        transitionKey={sentStatus}
      />

      {questions.length > 0 ? (
        <section className="home-page__questions" aria-labelledby="home-questions-title">
          <h2 id="home-questions-title">推荐问题</h2>
          <div className="home-page__question-grid">
            {questions.map((question) => (
              <button
                type="button"
                className="home-page__question"
                key={question.value}
                onClick={() => setDraft(question.value)}
              >
                {question.label}
              </button>
            ))}
          </div>
        </section>
      ) : (
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
      )}
    </div>
  );
}
