import { Stethoscope } from "@phosphor-icons/react";
import { Button } from "antd";
import type { DashboardDesignIssue } from "@/types/dashboardDesign";

export type SmartDesignCritiqueCardProps = {
  issues: DashboardDesignIssue[];
  busy?: boolean;
  onFix: (issue: DashboardDesignIssue) => void;
};

/** 设计诊断：全本地规则，不花模型钱；带 fix 的一键落到画布，其余只提示。 */
export function SmartDesignCritiqueCard({ issues, busy, onFix }: SmartDesignCritiqueCardProps) {
  if (issues.length === 0) return null;
  return (
    <section className="smart-design-critique" aria-label="设计诊断">
      <header>
        <Stethoscope size={15} weight="bold" aria-hidden="true" />
        <strong>设计诊断</strong>
        <span>{issues.length} 条</span>
      </header>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.code}-${issue.widgetId ?? ""}`} data-severity={issue.severity}>
            <span>{issue.message}</span>
            {issue.fix?.length ? (
              <Button size="small" disabled={busy} onClick={() => onFix(issue)}>一键修复</Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
