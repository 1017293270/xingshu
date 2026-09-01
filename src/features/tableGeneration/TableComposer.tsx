import { ArrowDown, PaperPlaneTilt, StopCircle } from "@phosphor-icons/react";
import { Button, Input } from "antd";

type TableComposerProps = {
  value: string;
  placeholder: string;
  busy: boolean;
  streaming: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  /** 用户上滚脱离后才出现，贴在输入条正上方居中。 */
  showScrollToBottom?: boolean;
  onScrollToBottom?: () => void;
};

/**
 * 贴底的细输入条：单行起步，随内容最多长到约六行。
 * 发送是内嵌在右侧的图标钮，没有独立工具条——这一页的动作都在工件卡和结果台上。
 */
export function TableComposer({
  value,
  placeholder,
  busy,
  streaming,
  onChange,
  onSubmit,
  onStop,
  showScrollToBottom,
  onScrollToBottom
}: TableComposerProps) {
  return (
    <section className="tgs-composer" aria-label="继续制表" aria-busy={busy ? true : undefined}>
      {showScrollToBottom && onScrollToBottom ? (
        <Button
          className="tgs-scroll-bottom"
          shape="circle"
          aria-label="回到底部"
          title="回到底部"
          icon={<ArrowDown size={16} weight="bold" aria-hidden="true" />}
          onClick={onScrollToBottom}
        />
      ) : null}
      <Input.TextArea
        aria-label="继续追问"
        variant="borderless"
        autoSize={{ minRows: 1, maxRows: 6 }}
        placeholder={placeholder}
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
        onPressEnter={(event) => {
          if (event.shiftKey) {
            return;
          }
          event.preventDefault();
          onSubmit();
        }}
      />
      <div className="tgs-composer__tail">
        {streaming ? (
          <Button
            className="tgs-composer__stop"
            danger
            type="text"
            size="small"
            icon={<StopCircle size={15} weight="fill" aria-hidden="true" />}
            onClick={onStop}
          >
            停止生成
          </Button>
        ) : null}
        <Button
          className="tgs-composer__send"
          type="primary"
          aria-label="继续制表"
          disabled={busy || !value.trim()}
          icon={<PaperPlaneTilt size={16} weight="fill" aria-hidden="true" />}
          onClick={onSubmit}
        />
      </div>
    </section>
  );
}
