import { Button } from "antd";
import { ArrowsClockwise, Database, Files, ShieldCheck, UploadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { XsIconTile } from "@/components/xs";
import cloudDriveIcon from "@/assets/cloud-icons/cloud-drive.png";
import { PageFrame } from "./PageFrame";

const cloudLanes = [
  { title: "企业文件", meta: "2,346 份资料", desc: "合同、制度、报告统一入库", icon: Files, tone: "blue" as const },
  { title: "知识素材", meta: "189 个条目", desc: "支持问答、写作与分析引用", icon: Database, tone: "cyan" as const },
  { title: "权限校验", meta: "6 个空间", desc: "按部门空间隔离资料范围", icon: ShieldCheck, tone: "green" as const }
];

const recentMaterials = [
  { name: "销售政策更新说明.pdf", owner: "市场部", status: "已解析" },
  { name: "Q2 经营分析附件.xlsx", owner: "产品部", status: "待同步" },
  { name: "合同审批规范.docx", owner: "法务部", status: "已入库" }
];

export function CloudPage() {
  const [workflowStatus, setWorkflowStatus] = useState("");

  const handleCreateUploadTask = () => {
    setWorkflowStatus("已创建上传任务");
  };

  const handleSyncKnowledgeBase = () => {
    setWorkflowStatus("已发起知识库同步");
  };

  return (
    <PageFrame
      title="我的云盘"
      subtitle="统一管理企业文件与智能分析资料"
      actions={(
        <>
          <Button icon={<ArrowsClockwise size={18} />} onClick={handleSyncKnowledgeBase}>同步知识库</Button>
          <Button type="primary" icon={<UploadSimple size={18} />} onClick={handleCreateUploadTask}>上传文件</Button>
        </>
      )}
    >
      <section className="xs-card cloud-workbench" aria-label="我的云盘内容">
        <div className="cloud-workbench__intro">
          <XsIconTile imageSrc={cloudDriveIcon} label="我的云盘" tone="cyan" />
          <div>
            <span className="cloud-eyebrow">企业资料工作台</span>
            <h2>资料上传后可用于问数、写作和知识问答</h2>
            <p>按企业文件、知识素材和权限范围组织资料，保留清晰的接入位置，后续真实云盘服务只需替换数据适配层。</p>
          </div>
        </div>
        <div className="cloud-workbench__metrics" aria-label="云盘概览指标">
          <div>
            <span>本月新增</span>
            <strong>86</strong>
          </div>
          <div>
            <span>解析完成率</span>
            <strong>94%</strong>
          </div>
          <div>
            <span>可用空间</span>
            <strong>6</strong>
          </div>
        </div>
      </section>

      <section className="cloud-lane-grid" aria-label="云盘资料分类">
        {cloudLanes.map((lane) => (
          <article className="xs-card cloud-lane" aria-label={`云盘资料：${lane.title}`} key={lane.title}>
            <XsIconTile icon={lane.icon} label={lane.title} tone={lane.tone} />
            <div>
              <h2>{lane.title}</h2>
              <strong>{lane.meta}</strong>
              <p>{lane.desc}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="xs-card cloud-recent" aria-labelledby="cloud-recent-title">
        <div className="section-title-row">
          <h2 id="cloud-recent-title">最近资料</h2>
          <Button type="link" onClick={handleSyncKnowledgeBase}>查看同步状态</Button>
        </div>
        <div className="cloud-recent__list">
          {recentMaterials.map((item) => (
            <div className="cloud-recent__row" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.owner}</span>
              <span className="xs-tag">{item.status}</span>
            </div>
          ))}
        </div>
      </section>
      {workflowStatus ? <p className="workflow-status cloud-status" role="status">{workflowStatus}</p> : null}
    </PageFrame>
  );
}
