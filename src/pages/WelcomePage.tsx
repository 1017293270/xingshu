import { Link } from "react-router";
import logo from "@/assets/brand/xingshu-logo-2x.png";
import welcomeHero from "@/assets/welcome/xingshu-welcome-hero-image2.webp";
import arrowIcon from "@/assets/welcome/icons/welcome-icon-enter-arrow.png";
import trustIcon from "@/assets/welcome/icons/welcome-icon-trust.png";
import dashboardIcon from "@/assets/icon-kit/xingshu-image2-v1/icon-business-dashboard.png";
import dataAnalysisIcon from "@/assets/icon-kit/xingshu-image2-v1/icon-data-question-analytics.png";
import knowledgeWritingIcon from "@/assets/icon-kit/xingshu-image2-v1/icon-intelligent-writing.png";
import "./styles/page-shell.css";
import "./welcome.css";

const capabilityItems = [
  {
    title: "问数分析",
    description: "把经营问题转成可追踪的数据结论",
    iconSrc: dataAnalysisIcon
  },
  {
    title: "知识写作",
    description: "连接企业知识库，生成可信文档",
    iconSrc: knowledgeWritingIcon
  },
  {
    title: "经营看板",
    description: "汇聚指标、预警与管理动作",
    iconSrc: dashboardIcon
  }
];

export function WelcomePage() {
  return (
    <main className="welcome-page" aria-label="星数欢迎页">
      <div className="welcome-page__shell">
        <header className="welcome-page__header" aria-label="星数欢迎页顶部">
          <Link className="welcome-page__brand" to="/" aria-label="进入星数首页">
            <img src={logo} alt="星数" width={400} height={183} />
          </Link>
          <div className="welcome-page__trust">
            <img className="welcome-page__trust-icon" src={trustIcon} alt="" data-icon-source="image2" />
            <span>企业可信数据智能入口</span>
          </div>
        </header>

        <section className="welcome-page__content" aria-labelledby="welcome-title">
          <div className="welcome-page__copy">
            <p className="welcome-page__eyebrow xs-hero-enter">XINGSHU AGENT HUB</p>
            <h1 id="welcome-title" className="xs-hero-enter" style={{ animationDelay: "70ms" }}>
              欢迎来到星数
            </h1>
            <p className="welcome-page__lead xs-hero-enter" style={{ animationDelay: "140ms" }}>
              可信数据智能，连接企业知识、经营数据与 Agent 应用。
            </p>
            <div className="welcome-page__actions xs-hero-enter" style={{ animationDelay: "220ms" }} aria-label="欢迎页操作">
              <Link className="welcome-page__button welcome-page__button--primary" to="/">
                <span>进入星数</span>
                <img className="welcome-page__button-icon" src={arrowIcon} alt="" data-icon-source="image2" />
              </Link>
              <Link className="welcome-page__button welcome-page__button--secondary" to="/analysis">
                开始智能问数
              </Link>
            </div>

            <div className="welcome-page__capabilities" aria-label="核心能力">
              {capabilityItems.map((item, index) => {
                return (
                  <article
                    className="welcome-page__capability xs-hero-enter"
                    style={{ animationDelay: `${300 + index * 70}ms` }}
                    key={item.title}
                  >
                    <span className="welcome-page__capability-icon" aria-hidden="true">
                      <img src={item.iconSrc} alt="" data-icon-source="xingshu-image2-v1" />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <em>{item.description}</em>
                    </span>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="welcome-page__visual xs-hero-enter" style={{ animationDelay: "260ms" }} aria-label="星数可信数据智能主视觉">
            <img src={welcomeHero} alt="星数可信数据智能主视觉" />
          </div>
        </section>
      </div>
    </main>
  );
}
