import { Clock, FileText, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import { useState, type ReactNode } from "react";
import { summarizeOfficialDocumentTemplate } from "@/services/officialDocumentFullDraft";
import type { OfficialDocumentTemplate } from "@/types/officialDocument";
import { formatDate, templateIsUsable, templateStatusLabel } from "./officialDocumentMeta";
import "./official-document-templates.css";

function templateGallerySummary(template: OfficialDocumentTemplate) {
  const analysis = template.currentVersion.analysis;
  return [
    analysis?.sectionCount ? `${analysis.sectionCount} 个章节` : "",
    analysis?.pageCount ? `${analysis.pageCount} 页` : ""
  ].filter(Boolean).join(" · ") || "结构模板";
}

export function TemplateGalleryCard({
  template,
  onUse,
  onOpen
}: {
  template: OfficialDocumentTemplate;
  onUse: (template: OfficialDocumentTemplate) => void;
  onOpen: (template: OfficialDocumentTemplate) => void;
}) {
  const usable = templateIsUsable(template.status);
  const headings = summarizeOfficialDocumentTemplate(template.currentVersion.analysis?.structureNodes ?? [])
    .filter((node) => node.role.startsWith("HEADING_"))
    .map((node) => node.preview.trim())
    .filter(Boolean)
    .slice(0, 3);
  const description = headings.join(" · ") || template.currentVersion.fileName;
  return (
    <article className="official-document-template-card" data-status={template.status}>
      <button
        type="button"
        className="official-document-template-card__open"
        aria-label={`打开模板 ${template.name}`}
        title="查看模板结构"
        onClick={() => onOpen(template)}
      >
        <span className="official-document-template-card__identity">
          <span className="official-document-template-card__glyph">
            <FileText size={30} weight="light" aria-hidden="true" />
          </span>
          <span className="official-document-template-card__text">
            <strong title={template.name}>{template.name}</strong>
            <span className="official-document-template-card__meta">
              <span>{templateGallerySummary(template)}</span>
              <span aria-hidden="true">·</span>
              <span>v{template.currentVersion.versionNo}</span>
              <span aria-hidden="true">·</span>
              <span className="official-document-template-card__status">
                {!usable && (template.status === "ANALYZING"
                  ? <Clock size={14} aria-hidden="true" />
                  : <WarningCircle size={14} aria-hidden="true" />)}
                {templateStatusLabel[template.status]}
              </span>
            </span>
          </span>
        </span>
        <span className="official-document-template-card__description">
          <span title={description}>{description}</span>
          <span className="official-document-template-card__updated">
            更新于 <time dateTime={template.updatedAt}>{formatDate(template.updatedAt)}</time>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="official-document-template-card__use"
        aria-label={`使用模板 ${template.name}`}
        title={usable ? "使用模板" : "请先查看结构并处理模板状态"}
        disabled={!usable}
        onClick={() => onUse(template)}
      >
        <Plus size={25} weight="regular" aria-hidden="true" />
      </button>
    </article>
  );
}

/**
 * 写作台的覆盖面板和 /writing/templates 独立页共用它，只有外层动作不同。
 */
export function TemplateGallery({
  templates,
  label,
  actions,
  empty,
  onUse,
  onOpen,
  overlay
}: {
  templates: OfficialDocumentTemplate[];
  label: string;
  actions?: ReactNode;
  empty?: ReactNode;
  onUse: (template: OfficialDocumentTemplate) => void;
  onOpen: (template: OfficialDocumentTemplate) => void;
  overlay?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const usableCount = templates.filter((template) => templateIsUsable(template.status)).length;
  const query = search.trim().toLocaleLowerCase();
  const visibleTemplates = templates.filter((template) => {
    const matchesStatus = filter === "all" || templateIsUsable(template.status) === (filter === "usable");
    return matchesStatus && `${template.name} ${template.currentVersion.fileName}`.toLocaleLowerCase().includes(query);
  });

  return (
    <section className="official-document-templates" aria-label={label} data-overlay={overlay || undefined}>
      <header className="official-document-templates__head">
        <div className="official-document-templates__intro">
          <div className="official-document-templates__title">
            <h2>模板库</h2>
            <span className="official-document-templates__count">{templates.length} 份结构模板</span>
          </div>
        </div>
        {actions ? <div className="official-document-templates__actions">{actions}</div> : null}
      </header>
      {templates.length ? (
        <>
          <div className="official-document-templates__toolbar">
            <div className="official-document-templates__filters" role="group" aria-label="按模板状态筛选">
              {[
                { value: "all", label: "全部模板", count: templates.length },
                { value: "usable", label: "可用模板", count: usableCount },
                { value: "pending", label: "待处理", count: templates.length - usableCount }
              ].map((item) => (
                <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
                  {item.label}<span>{item.count}</span>
                </button>
              ))}
            </div>
            <Input
              className="official-document-templates__search"
              aria-label="搜索模板"
              placeholder="搜索模板名称或文件名"
              prefix={<MagnifyingGlass size={17} aria-hidden="true" />}
              allowClear
              autoFocus={overlay}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <span className="sr-only" role="status">当前显示 {visibleTemplates.length} 份模板</span>
          {visibleTemplates.length ? (
            <div className="official-document-templates__grid">
              {visibleTemplates.map((template) => (
                <TemplateGalleryCard key={template.id} template={template} onUse={onUse} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <div className="official-document-templates__empty">
              <MagnifyingGlass size={28} aria-hidden="true" />
              <h3>没有符合条件的模板</h3>
              <p>试试其他关键词，或清除筛选查看全部模板。</p>
              <Button onClick={() => { setSearch(""); setFilter("all"); }}>清除筛选</Button>
            </div>
          )}
        </>
      ) : empty}
    </section>
  );
}
