import { ArrowDown, ArrowUp, Square } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { Ref } from "react";

type TableComposerProps = {
  value: string;
  placeholder: string;
  busy: boolean;
  streaming: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  inputRef?: Ref<TextAreaRef>;
  /** 用户上滚脱离后才出现，贴在输入条正上方居中。 */
  showScrollToBottom?: boolean;
  onScrollToBottom?: () => void;
};

/**
 * 两行起步的制表编辑区；可以在生成时起草下一轮，停止与发送共用右下角位置。
 */
export function TableComposer({
  value,
  placeholder,
  busy,
  streaming,
  onChange,
  onSubmit,
  onStop,
  inputRef,
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
        ref={inputRef}
        aria-label="继续追问"
        enterKeyHint="send"
        variant="borderless"
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={placeholder}
        value={value}
        disabled={busy && !streaming}
        onChange={(event) => onChange(event.target.value)}
        onPressEnter={(event) => {
          if (event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) {
            return;
          }
          event.preventDefault();
          if (!busy && value.trim()) onSubmit();
        }}
      />
      <div className="tgs-composer__tail">
        <span className="tgs-composer__hint">{streaming ? "可以先写好下一轮要求" : "Enter 发送 · Shift+Enter 换行"}</span>
        {streaming ? (
          <Button
            className="tgs-composer__stop"
            aria-label="停止生成"
            title="停止生成"
            icon={<Square size={14} weight="fill" aria-hidden="true" />}
            onClick={onStop}
          />
        ) : <Button
          className="tgs-composer__send"
          type="primary"
          aria-label="继续制表"
          title="发送制表要求"
          disabled={busy || !value.trim()}
          icon={<ArrowUp size={17} weight="bold" aria-hidden="true" />}
          onClick={onSubmit}
        />}
      </div>
    </section>
  );
}
