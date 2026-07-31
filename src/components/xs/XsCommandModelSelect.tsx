import { Dropdown, type MenuProps } from "antd";
import { BookOpen, CaretDown, ChartLine, FileMagnifyingGlass, TreeStructure } from "@phosphor-icons/react";
import type { DataHubChatMode } from "@/types/dataHub";

export type XsCommandModelOption = {
  value: DataHubChatMode;
  label: string;
  description: string;
  Icon: typeof TreeStructure;
};

export const XS_COMMAND_MODEL_OPTIONS: readonly XsCommandModelOption[] = [
  {
    value: "agent",
    label: "编排模型",
    description: "自动拆解并组合数据与知识能力",
    Icon: TreeStructure
  },
  {
    value: "ask",
    label: "问数模型",
    description: "指标、趋势与结构化数据分析",
    Icon: ChartLine
  },
  {
    value: "rag",
    label: "问知模型",
    description: "企业制度、合同与知识库检索",
    Icon: BookOpen
  },
  {
    value: "document_lookup",
    label: "找文档模型",
    description: "定位并打开有权限的企业文档",
    Icon: FileMagnifyingGlass
  }
];

export function getXsCommandModelMeta(value: DataHubChatMode) {
  return XS_COMMAND_MODEL_OPTIONS.find((option) => option.value === value)
    ?? XS_COMMAND_MODEL_OPTIONS[0];
}

type XsCommandModelSelectProps = {
  value: DataHubChatMode;
  onChange: (value: DataHubChatMode) => void;
};

export function XsCommandModelSelect({ value, onChange }: XsCommandModelSelectProps) {
  const activeModel = getXsCommandModelMeta(value);
  const items: MenuProps["items"] = XS_COMMAND_MODEL_OPTIONS.map((option) => ({
    key: option.value,
    label: (
      <span className="xs-command-model-option" data-mode={option.value}>
        <option.Icon className="xs-command-model-option__icon" size={16} aria-hidden="true" />
        <span className="xs-command-model-option__copy">
          <strong>{option.label}</strong>
          <small>{option.description}</small>
        </span>
      </span>
    )
  }));

  return (
    <Dropdown
      menu={{
        items,
        selectable: true,
        selectedKeys: [value],
        onClick: ({ key }) => onChange(key as DataHubChatMode)
      }}
      overlayClassName="xs-command-model-menu"
      placement="topRight"
      trigger={["click"]}
    >
      <button
        type="button"
        className="xs-command-model-select"
        data-mode={value}
        aria-label={`选择模型，当前${activeModel.label}`}
      >
        <span className="xs-command-model-select__icon" aria-hidden="true">
          <activeModel.Icon size={15} />
        </span>
        <span>{activeModel.label}</span>
        <CaretDown className="xs-command-model-select__caret" size={12} aria-hidden="true" />
      </button>
    </Dropdown>
  );
}
