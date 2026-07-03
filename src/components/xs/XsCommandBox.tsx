import { Button } from "antd";
import { ArrowUp, Microphone, Paperclip } from "@phosphor-icons/react";

type XsCommandBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAttach?: () => void;
  onVoice?: () => void;
};

export function XsCommandBox({ value, onChange, onSubmit, onAttach, onVoice }: XsCommandBoxProps) {
  return (
    <section className="xs-command-box" aria-label="星数命令输入区">
      <textarea
        className="xs-command-box__input"
        aria-label="命令输入"
        value={value}
        placeholder="向星数提问，或选择一个推荐应用开始"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="xs-command-box__toolbar">
        <div className="xs-command-box__hint">企业数据、文档、看板与 Agent 应用统一入口</div>
        <div className="xs-command-box__actions">
          <Button aria-label="附件" icon={<Paperclip size={19} />} onClick={onAttach} />
          <Button aria-label="语音" icon={<Microphone size={19} />} onClick={onVoice} />
          <Button
            type="primary"
            className="xs-command-box__send"
            aria-label="发送"
            icon={<ArrowUp size={19} weight="bold" />}
            onClick={onSubmit}
          />
        </div>
      </div>
    </section>
  );
}
