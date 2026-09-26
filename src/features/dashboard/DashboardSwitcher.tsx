import { Trash } from "@phosphor-icons/react";
import { Select } from "antd";
import { useState } from "react";
import type { DashboardRecord } from "@/types/dashboardStudio";
import { isOwnedByUser } from "./currentDashboard";
import "./dashboard-switcher.css";

type DashboardSwitcherProps = {
  records: DashboardRecord[];
  currentId: string;
  userId?: number;
  onSelect: (id: string) => void;
  onRequestDelete: (record: DashboardRecord) => void;
};

/**
 * 「我的看板」页头的看板切换器。这里就是本页的看板列表，所以删除任意一块自己的看板也放在这里：
 * 作者本人的选项尾部有删除按钮，别人共享到空间的板没有（后端只允许作者删除）。
 * 当前这块另有齿轮菜单里的「删除」，键盘用户走那条路。
 */
export function DashboardSwitcher({ records, currentId, userId, onSelect, onRequestDelete }: DashboardSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <Select
      className="dashboard-current__switch"
      aria-label="切换当前看板"
      value={currentId}
      open={open}
      onOpenChange={setOpen}
      popupMatchSelectWidth={false}
      classNames={{ popup: { root: "dashboard-workspace-popup dashboard-switcher-popup" } }}
      options={records.map((record) => ({ value: record.id, label: record.schema.title }))}
      optionRender={(option) => {
        const record = records.find((item) => item.id === option.value);
        const title = record?.schema.title ?? String(option.label ?? "");
        return (
          <span className="dashboard-switcher__option">
            <span className="dashboard-switcher__label">{title}</span>
            {record && isOwnedByUser(record, userId) ? (
              <button
                type="button"
                className="dashboard-switcher__delete"
                aria-label={`删除看板「${title}」`}
                title="删除看板"
                onClick={(event) => {
                  // 选项本身点一下就会切换看板，删除按钮必须拦住这次冒泡。
                  event.stopPropagation();
                  setOpen(false);
                  onRequestDelete(record);
                }}
              >
                <Trash size={14} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        );
      }}
      onChange={onSelect}
    />
  );
}
