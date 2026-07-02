import { Cloud } from "@phosphor-icons/react";
import { XsIconTile } from "@/components/xs";
import { PageFrame } from "./PageFrame";

export function CloudPage() {
  return (
    <PageFrame title="我的云盘" subtitle="统一管理企业文件与智能分析资料">
      <section className="xs-card cloud-empty" aria-label="我的云盘内容">
        <XsIconTile icon={Cloud} label="我的云盘" tone="cyan" />
        <div>
          <h2>云盘能力预留</h2>
          <p>正式后端接入前，此处保留企业文件、附件和知识资料入口。</p>
        </div>
      </section>
    </PageFrame>
  );
}
