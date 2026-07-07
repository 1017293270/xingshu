import { XsAppCard, type XsAppCardData, XsCommandBox, XsShell } from "@/components/xs";
import { useNavigate } from "react-router-dom";
import appDataChatIcon from "@/assets/generated-icons/app-data-chat.png";
import appDocumentAssistantIcon from "@/assets/generated-icons/app-document-assistant.png";
import appKnowledgeQaIcon from "@/assets/generated-icons/app-knowledge-qa.png";
import appMeetingMinutesIcon from "@/assets/generated-icons/app-meeting-minutes.png";
import appMoreAppsIcon from "@/assets/generated-icons/app-more-apps.png";
import appReportGenerationIcon from "@/assets/generated-icons/app-report-generation.png";
import appWritingIcon from "@/assets/generated-icons/app-writing.png";
import homeWaveBg from "@/assets/home/xingshu-home-wave-bg-image2.png";
import { sendAgentMessage } from "@/services/agentService";
import { useUiStore } from "@/stores/uiStore";
import "./home.css";

const recommendedApps: XsAppCardData[] = [
  {
    id: "data-chat",
    title: "智能问数",
    description: "经营指标、趋势变化和数据洞察",
    prompt: "帮我分析本月经营数据，并生成趋势图表",
    imageSrc: appDataChatIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue"
  },
  {
    id: "knowledge",
    title: "知识问答",
    description: "制度、合同和企业知识快速检索",
    prompt: "帮我查询最新销售政策中的重点变化",
    imageSrc: appKnowledgeQaIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "cyan"
  },
  {
    id: "document",
    title: "文档助手",
    description: "读取文档并提炼关键结论",
    prompt: "帮我总结这份项目材料的关键风险",
    imageSrc: appDocumentAssistantIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "green"
  },
  {
    id: "report",
    title: "报表生成",
    description: "生成可复用的分析报表和图表",
    prompt: "根据销售数据生成一份周报",
    imageSrc: appReportGenerationIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "orange"
  },
  {
    id: "writing",
    title: "智能写作",
    description: "报告总结、方案策划与工作汇报",
    prompt: "帮我写一份经营分析汇报提纲",
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
    tone: "blue"
  },
  {
    id: "more-apps",
    title: "更多应用",
    description: "打开更多企业智能能力",
    prompt: "帮我打开更多企业智能应用",
    imageSrc: appMoreAppsIcon,
    imageSource: "xingshu-home-apps-image2-v1",
    tone: "blue"
  }
];

export function HomePage() {
  const navigate = useNavigate();
  const draft = useUiStore((state) => state.homeDraft);
  const selectedAppId = useUiStore((state) => state.selectedAppId);
  const isMoreOpen = useUiStore((state) => state.isMoreOpen);
  const sentStatus = useUiStore((state) => state.sentStatus);
  const setDraft = useUiStore((state) => state.setHomeDraft);
  const selectApp = useUiStore((state) => state.selectApp);
  const clearHomeConversation = useUiStore((state) => state.clearHomeConversation);
  const setSentStatus = useUiStore((state) => state.setSentStatus);
  const setActiveAnalysisQuestion = useUiStore((state) => state.setActiveAnalysisQuestion);
  const toggleMore = useUiStore((state) => state.toggleMore);

  function handleSelectApp(app: XsAppCardData) {
    selectApp(app.id, app.prompt);
  }

  function handleNewChat() {
    clearHomeConversation();
  }

  async function handleSubmit() {
    const command = draft.trim();
    if (!command) {
      return;
    }
    await sendAgentMessage({ content: command });
    setActiveAnalysisQuestion(command);
    setSentStatus(`已发送：${command}`);
    navigate("/analysis");
  }

  return (
    <XsShell
      isMoreOpen={isMoreOpen}
      onToggleMore={toggleMore}
      onNewChat={handleNewChat}
    >
      <div className="home-page">
        <img className="home-page__bg" src={homeWaveBg} alt="" aria-hidden="true" />
        <section className="home-page__hero" aria-labelledby="home-greeting">
          <h1 id="home-greeting">
            您好，张三 <span aria-hidden="true">👋</span>
          </h1>
          <p>我是您的数据管家，有什么可以帮您？</p>
        </section>

        <XsCommandBox
          value={draft}
          onChange={setDraft}
          onSubmit={handleSubmit}
          onAttach={() => setSentStatus("已打开附件选择")}
          onVoice={() => setSentStatus("已准备语音输入")}
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
              />
            ))}
          </div>
        </section>
      </div>
    </XsShell>
  );
}
