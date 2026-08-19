type TablePlaceholderProps = {
  /** loading=还原/生成中，走微光；idle=还没有结果表，静态空表框。 */
  state: "idle" | "loading";
  title: string;
  hint: string;
};

const PLACEHOLDER_COLUMNS = 5;
const PLACEHOLDER_ROWS = 6;

/**
 * 结果表位常驻：无论空态还是加载中，工作台都保持一张"空表"的形状，
 * 而不是留下一片空白。加载动画就发生在这张空表里。
 */
export function TablePlaceholder({ state, title, hint }: TablePlaceholderProps) {
  return (
    // 状态播报由页面底部的 XsStatusBar 统一负责，这里只标记忙碌，避免两个 live region 抢播
    <div className="table-placeholder" data-state={state} aria-busy={state === "loading"}>
      <div className="table-placeholder__head">
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
      <div className="table-placeholder__grid" aria-hidden="true">
        <div className="table-placeholder__row table-placeholder__row--head">
          {Array.from({ length: PLACEHOLDER_COLUMNS }, (_, column) => (
            <span key={column} />
          ))}
        </div>
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, row) => (
          <div className="table-placeholder__row" key={row} style={{ "--row-index": row } as React.CSSProperties}>
            {Array.from({ length: PLACEHOLDER_COLUMNS }, (_, column) => (
              <span key={column} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
