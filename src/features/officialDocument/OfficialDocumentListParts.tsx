import { ArrowClockwise, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input } from "antd";
import type { CSSProperties, ReactNode } from "react";

const STAGGER_MS = 32;
const STAGGER_MAX_MS = 200;

export function listStaggerDelay(index: number) {
  return `${Math.min(index * STAGGER_MS, STAGGER_MAX_MS)}ms`;
}

export type OfficialDocumentListColumn = {
  key: string;
  label: string;
  /** 窄屏下折叠的次要列。 */
  optional?: boolean;
};

export type OfficialDocumentListFilter<TKey extends string> = {
  key: TKey;
  label: string;
  count: number;
};

export function OfficialDocumentViewHead({ description }: { description: string }) {
  return (
    <p className="official-document-view__lede">{description}</p>
  );
}

export function OfficialDocumentToolbar<TKey extends string>({
  searchValue,
  searchLabel,
  searchPlaceholder,
  onSearchChange,
  filters,
  filterLabel,
  activeFilter,
  onFilterChange,
  summary,
  onRefresh,
  isRefreshing
}: {
  searchValue: string;
  searchLabel: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  filters: Array<OfficialDocumentListFilter<TKey>>;
  filterLabel: string;
  activeFilter: TKey;
  onFilterChange: (key: TKey) => void;
  summary: ReactNode;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="official-document-toolbar-row">
      <div className="official-document-filters" role="group" aria-label={filterLabel}>
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={activeFilter === filter.key}
            onClick={() => onFilterChange(filter.key)}
          >
            {filter.label}
            <span>{filter.count}</span>
          </button>
        ))}
      </div>
      <div className="official-document-toolbar-row__tail">
        <span className="official-document-toolbar-row__summary">{summary}</span>
        <Input
          allowClear
          prefix={<MagnifyingGlass size={15} />}
          value={searchValue}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Button
          icon={<ArrowClockwise size={16} />}
          aria-label="刷新列表"
          loading={isRefreshing}
          onClick={onRefresh}
        />
      </div>
    </div>
  );
}

export function OfficialDocumentList({
  ariaLabel,
  columns,
  gridTemplate,
  children
}: {
  ariaLabel: string;
  columns: OfficialDocumentListColumn[];
  gridTemplate: string;
  children: ReactNode;
}) {
  return (
    <div className="official-document-list" style={{ "--od-columns": gridTemplate } as CSSProperties}>
      <div className="official-document-list__columns" aria-hidden="true">
        {columns.map((column) => (
          <span key={column.key} data-optional={column.optional || undefined}>{column.label}</span>
        ))}
        <span />
      </div>
      <ul className="official-document-list__rows" aria-label={ariaLabel}>{children}</ul>
    </div>
  );
}

export function OfficialDocumentRow({
  ariaLabel,
  index,
  onOpen,
  children
}: {
  ariaLabel: string;
  index: number;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <li className="official-document-row xs-page-enter" style={{ animationDelay: listStaggerDelay(index) }}>
      <button type="button" aria-label={ariaLabel} onClick={onOpen}>
        {children}
        <CaretRight size={15} aria-hidden="true" className="official-document-row__caret" />
      </button>
    </li>
  );
}

export function OfficialDocumentRowLead({
  glyph,
  title,
  meta
}: {
  glyph: ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <span className="official-document-row__lead">
      <span className="official-document-row__glyph" aria-hidden="true">{glyph}</span>
      <span className="official-document-row__name">
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
    </span>
  );
}

export function OfficialDocumentRowCell({
  optional,
  mono,
  children
}: {
  optional?: boolean;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className="official-document-row__cell"
      data-optional={optional || undefined}
      data-mono={mono || undefined}
    >
      {children}
    </span>
  );
}
