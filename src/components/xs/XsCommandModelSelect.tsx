import { BookOpen, ChartLine, FileMagnifyingGlass, TreeStructure } from "@phosphor-icons/react";
import type { DataHubChatMode } from "@/types/dataHub";

export type XsCommandModelOption = {
  value: DataHubChatMode;
  label: string;
  shortLabel: string;
  description: string;
  Icon: typeof TreeStructure;
};

export const XS_COMMAND_MODEL_OPTIONS: readonly XsCommandModelOption[] = [
  {
    value: "agent",
    label: "编排模型",
    shortLabel: "编排",
    description: "自动拆解并组合数据与知识能力",
    Icon: TreeStructure
  },
  {
    value: "ask",
    label: "问数模型",
    shortLabel: "查数据",
    description: "指标、趋势与结构化数据分析",
    Icon: ChartLine
  },
  {
    value: "rag",
    label: "问知模型",
    shortLabel: "查知识",
    description: "企业制度、合同与知识库检索",
    Icon: BookOpen
  },
  {
    value: "document_lookup",
    label: "找文档模型",
    shortLabel: "找文档",
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

export function XsCommandModelSelect({
  value,
  onChange
}: XsCommandModelSelectProps) {
  return (
    <div className="xs-command-model-select" role="group" aria-label="选择能力">
      {XS_COMMAND_MODEL_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            type="button"
            className="xs-command-model-select__chip"
            data-mode={option.value}
            data-selected={selected || undefined}
            aria-pressed={selected}
            aria-label={selected ? `选择模型，当前${option.label}` : `切换到${option.label}`}
            title={option.description}
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            <option.Icon size={15} aria-hidden="true" />
            <span>{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
