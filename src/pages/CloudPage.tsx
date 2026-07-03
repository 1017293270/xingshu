import { Button } from "antd";
import { UploadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { XsIconTile } from "@/components/xs";
import cloudDriveIcon from "@/assets/cloud-icons/cloud-drive.png";
import { PageFrame } from "./PageFrame";

export function CloudPage() {
  const [workflowStatus, setWorkflowStatus] = useState("");

  const handleCreateUploadTask = () => {
    setWorkflowStatus("已创建上传任务");
  };

  return (
    <PageFrame title="我的云盘" subtitle="统一管理企业文件与智能分析资料">
      <section className="xs-card cloud-empty" aria-label="我的云盘内容">
        <XsIconTile imageSrc={cloudDriveIcon} label="我的云盘" tone="cyan" />
        <div className="cloud-empty__content">
          <h2>云盘能力预留</h2>
          <p>正式后端接入前，此处保留企业文件、附件和知识资料入口。</p>
          <Button type="primary" icon={<UploadSimple size={18} />} onClick={handleCreateUploadTask}>上传文件</Button>
        </div>
      </section>
      {workflowStatus ? <p className="workflow-status cloud-status" role="status">{workflowStatus}</p> : null}
    </PageFrame>
  );
}
