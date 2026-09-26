import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommandBoxHeight } from "./useCommandBoxHeight";

function AnchoredPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  useCommandBoxHeight(pageRef);

  return (
    <div className="home-page" ref={pageRef}>
      <section className="xs-command-box" />
    </div>
  );
}

describe("useCommandBoxHeight", () => {
  let commandBoxHeight = 0;
  let notifyResize: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("xs-command-box") ? commandBoxHeight : 0;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }

        observe() {}

        disconnect() {
          notifyResize = undefined;
        }
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    notifyResize = undefined;
  });

  it("writes the measured command box height back to the anchor variable and follows toolbar wraps", () => {
    commandBoxHeight = 136;
    const { container, unmount } = render(<AnchoredPage />);
    const page = container.querySelector<HTMLElement>(".home-page")!;

    expect(page.style.getPropertyValue("--home-command-height")).toBe("136px");

    /* 更窄的手机上模式按钮折成两行，命令框长高 */
    commandBoxHeight = 168;
    notifyResize?.();
    expect(page.style.getPropertyValue("--home-command-height")).toBe("168px");

    unmount();
    expect(notifyResize).toBeUndefined();
  });

  it("keeps the stylesheet fallback while the command box has no layout", () => {
    commandBoxHeight = 0;
    const { container } = render(<AnchoredPage />);

    expect(container.querySelector<HTMLElement>(".home-page")!.style.getPropertyValue("--home-command-height")).toBe("");
  });
});
