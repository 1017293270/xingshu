import { useLayoutEffect, type RefObject } from "react";

/**
 * 首页以命令框为锚点排版（home.css 的 --home-anchor）：问候区要让出命令框高度的一半，
 * 命令框中心才正好落在滚动区中线上。窄屏上工具条会随宽度折成两到三行，
 * 命令框高度在 100~168px 之间变，所以按实测高度写回 --home-command-height，
 * 样式表里的值只在测量之前兜底。
 *
 * 在绘制前同步量一次，之后交给 ResizeObserver：字体晚到、跨断点改宽都会重新对齐。
 * 写回的变量只改问候区高度、不改命令框尺寸，不会触发观察回环。
 */
export function useCommandBoxHeight(pageRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const page = pageRef.current;
    const commandBox = page?.querySelector<HTMLElement>(".xs-command-box");
    if (!page || !commandBox) {
      return undefined;
    }

    const sync = () => {
      const height = commandBox.offsetHeight;
      /* 0 表示还没参与布局（jsdom、被隐藏），保留样式表兜底值 */
      if (height > 0) {
        page.style.setProperty("--home-command-height", `${height}px`);
      }
    };

    sync();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(sync);
    observer.observe(commandBox);
    return () => observer.disconnect();
  }, [pageRef]);
}
