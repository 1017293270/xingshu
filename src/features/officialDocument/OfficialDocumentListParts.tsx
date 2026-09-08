import { ArrowClockwise, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { Button, Input, Segmented } from "antd";
import type { CSSProperties, ReactNode } from "react";

const STAGGER_MS = 32;
const STAGGER_MAX_MS = 160;

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
      <Input
        allowClear
        className="official-document-toolbar-row__search"
        prefix={<MagnifyingGlass size={16} />}
        value={searchValue}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <Segmented
        className="official-document-filters"
        aria-label={filterLabel}
        value={activeFilter}
        options={filters.map((filter) => ({
          value: filter.key,
          label: (
            <>
              {filter.label}
              <span className="official-document-filters__count">{filter.count}</span>
            </>
          )
        }))}
        onChange={(value) => onFilterChange(value as TKey)}
      />
      <span className="official-document-toolbar-row__summary">{summary}</span>
      <Button
        icon={<ArrowClockwise size={16} />}
        aria-label="刷新列表"
        loading={isRefreshing}
        onClick={onRefresh}
      />
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
  children,
  actions
}: {
  ariaLabel: string;
  index: number;
  onOpen: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li data-actions={actions ? true : undefined} className="official-document-row xs-page-enter" style={{ animationDelay: listStaggerDelay(index) }}>
      <button type="button" aria-label={ariaLabel} onClick={onOpen}>
        {children}
        {actions ? <span className="official-document-draft-edit">编辑</span> : <CaretRight size={15} aria-hidden="true" className="official-document-row__caret" />}
      </button>
      {actions ? <div className="official-document-draft-actions">{actions}</div> : null}
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
