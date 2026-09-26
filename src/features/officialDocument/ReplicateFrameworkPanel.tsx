import { ArrowDown, ArrowUp, FileDoc, Plus, Trash } from "@phosphor-icons/react";
import { Button, Input, Select } from "antd";
import { useEffect, useRef, useState } from "react";
import { XsStatusBar } from "@/components/xs/XsStatusBar";
import {
  insertReplicateSection,
  moveReplicateSection,
  REPLICATE_LEVEL_LABELS,
  removeReplicateSection,
  updateReplicateSection,
  type ReplicateFramework,
  type ReplicateSectionLevel
} from "./replicateFramework";
import "./replicate-framework.css";

const LEVEL_OPTIONS = (Object.entries(REPLICATE_LEVEL_LABELS) as Array<[ReplicateSectionLevel, string]>)
  .map(([value, label]) => ({ value, label }));

function warningText(framework: ReplicateFramework) {
  if (framework.warnings.includes("UNREADABLE")) {
    return {
      message: "没从这份文档里读出正文",
      detail: `${framework.parseError ? `${framework.parseError}。` : ""}可以换一份 DOCX 重新上传，或在下面手动搭框架。`
    };
  }
  if (framework.warnings.includes("NO_HEADINGS")) {
    return {
      message: "没识别出章节标题，已把整篇作为一节",
      detail: "可以用下方「添加章节」手动拆分，或把这一节改成标题。"
    };
  }
  return null;
}

/**
 * 内容复刻的左栏：原文读出来的章节清单，逐节可改标题、层级、要点，也能挪位置和增删。
 * 这里只改框架本身；生成时右侧拿最新的框架当已确认大纲，原文摘录只给人对照。
 */
export function ReplicateFrameworkPanel({
  framework,
  busy,
  onChange,
  onReupload,
  onExit
}: {
  framework: ReplicateFramework;
  /** 生成进行中：框架照样能改（下一轮才用），但换原文和退出要等这一轮结束。 */
  busy: boolean;
  onChange: (framework: ReplicateFramework) => void;
  onReupload: () => void;
  onExit: () => void;
}) {
  const warning = warningText(framework);
  const sections = framework.sections;
  /* 新增一节后把光标直接放进它的标题框，省得用户在长列表里找。 */
  const [focusSectionId, setFocusSectionId] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!focusSectionId) return;
    /* id 只由字母数字和连字符组成，直接拼进选择器 */
    const input = listRef.current?.querySelector<HTMLInputElement>(
      `[data-section-id="${focusSectionId}"] input.replicate-framework__title`
    );
    input?.focus();
    input?.scrollIntoView?.({ block: "nearest" });
    setFocusSectionId("");
  }, [focusSectionId]);

  const insertAfter = (sectionId?: string) => {
    const inserted = insertReplicateSection(framework, sectionId);
    onChange(inserted.framework);
    setFocusSectionId(inserted.sectionId);
  };

  return (
    <aside className="replicate-framework" aria-label="内容框架">
      <header className="replicate-framework__head">
        <div className="replicate-framework__heading">
          <h2>内容框架</h2>
          <p className="replicate-framework__source" title={framework.source.name}>
            <FileDoc size={15} aria-hidden="true" />
            <span>{framework.source.name}</span>
          </p>
          <p className="replicate-framework__count">
            {sections.length} 节
            {framework.source.paragraphCount ? ` · 原文 ${framework.source.paragraphCount} 段` : ""}
            {framework.source.tableCount ? ` · ${framework.source.tableCount} 张表` : ""}
          </p>
        </div>
        <div className="replicate-framework__head-actions">
          <Button
            size="small"
            disabled={busy}
            title={busy ? "这一轮生成结束后再换原文" : "换一份原文，重新读出框架"}
            onClick={onReupload}
          >重新上传</Button>
          <Button
            size="small"
            disabled={busy}
            title={busy ? "这一轮生成结束后再退出" : "回到普通写作，已生成的成稿保留在对话里"}
            onClick={onExit}
          >退出复刻</Button>
        </div>
      </header>

      {warning ? <XsStatusBar tone="warning" message={warning.message} detail={warning.detail} /> : null}
      {framework.sourceTextCondensed ? (
        <p className="replicate-framework__note">原文较长，发给模型的是按章节均匀节选的版本，每一节都保留了样子。</p>
      ) : null}

      <ol className="replicate-framework__list" ref={listRef} aria-label="章节列表">
        {sections.map((section, index) => {
          const order = index + 1;
          const heading = section.level !== "BODY";
          return (
            <li
              key={section.id}
              className="replicate-framework__section"
              data-level={section.level}
              data-section-id={section.id}
            >
              <div className="replicate-framework__row">
                <Select
                  className="replicate-framework__level"
                  size="small"
                  value={section.level}
                  options={LEVEL_OPTIONS}
                  aria-label={`第 ${order} 节层级`}
                  popupMatchSelectWidth={false}
                  onChange={(level) => onChange(updateReplicateSection(framework, section.id, { level }))}
                />
                <Input
                  className="replicate-framework__title"
                  size="small"
                  value={section.title}
                  aria-label={`第 ${order} 节标题`}
                  placeholder={heading ? "章节标题" : "这段写什么（不出标题）"}
                  status={heading && !section.title.trim() ? "warning" : undefined}
                  maxLength={120}
                  onChange={(event) => onChange(updateReplicateSection(framework, section.id, { title: event.target.value }))}
                />
                <div className="replicate-framework__tools">
                  <Button
                    type="text"
                    size="small"
                    aria-label={`上移第 ${order} 节`}
                    title="上移"
                    disabled={index === 0}
                    icon={<ArrowUp size={14} aria-hidden="true" />}
                    onClick={() => onChange(moveReplicateSection(framework, section.id, -1))}
                  />
                  <Button
                    type="text"
                    size="small"
                    aria-label={`下移第 ${order} 节`}
                    title="下移"
                    disabled={index === sections.length - 1}
                    icon={<ArrowDown size={14} aria-hidden="true" />}
                    onClick={() => onChange(moveReplicateSection(framework, section.id, 1))}
                  />
                  <Button
                    type="text"
                    size="small"
                    aria-label={`在第 ${order} 节后插入一节`}
                    title="在下面插入一节"
                    icon={<Plus size={14} aria-hidden="true" />}
                    onClick={() => insertAfter(section.id)}
                  />
                  <Button
                    type="text"
                    size="small"
                    aria-label={`删除第 ${order} 节`}
                    title={sections.length <= 1 ? "至少保留一节" : "删除这一节"}
                    disabled={sections.length <= 1}
                    icon={<Trash size={14} aria-hidden="true" />}
                    onClick={() => onChange(removeReplicateSection(framework, section.id))}
                  />
                </div>
              </div>
              <Input.TextArea
                className="replicate-framework__points"
                value={section.keyPoints.join("\n")}
                aria-label={`第 ${order} 节要点`}
                placeholder="这一节要写到的内容，每行一条"
                autoSize={{ minRows: 1, maxRows: 6 }}
                /* 空行先留着，不然回车换不了行；生成前统一去掉空要点 */
                onChange={(event) => onChange(updateReplicateSection(framework, section.id, {
                  keyPoints: event.target.value.split("\n")
                }))}
              />
              {section.excerpt ? (
                <details className="replicate-framework__excerpt">
                  <summary>原文摘录 · {section.excerpt.length} 字</summary>
                  <p>{section.excerpt}</p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>

      <Button
        className="replicate-framework__append"
        icon={<Plus size={15} aria-hidden="true" />}
        onClick={() => insertAfter()}
      >添加章节</Button>
    </aside>
  );
}
