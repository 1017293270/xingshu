import { Button } from "antd";
import { Microphone, PaperPlaneTilt } from "@phosphor-icons/react";

type XsCommandBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onVoice?: () => void;
};

export function XsCommandBox({ value, onChange, onSubmit, onVoice }: XsCommandBoxProps) {
  return (
    <section className="xs-command-box" aria-label="星数命令输入区">
      <textarea
        className="xs-command-box__input"
        aria-label="命令输入"
        value={value}
        placeholder="请输入您的问题，支持问题、找文件、写文档、做分析、用应用..."
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="xs-command-box__toolbar">
        <div className="xs-command-box__actions">
          <Button className="xs-command-box__tool" aria-label="语音" icon={<Microphone size={22} />} onClick={onVoice} />
          <Button
            type="primary"
            className="xs-command-box__send"
            aria-label="发送"
            icon={<PaperPlaneTilt size={22} weight="fill" />}
            onClick={onSubmit}
          />
        </div>
      </div>
    </section>
  );
}
