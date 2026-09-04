import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppVersionBadge } from "./AppVersionBadge";
import { appVersion, resolveAppVersion } from "./appVersion";

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppVersionBadge />
    </MemoryRouter>
  );
}

describe("resolveAppVersion", () => {
  it("VITE_APP_VERSION 覆盖 package.json 注入值", () => {
    expect(resolveAppVersion("beta0.3", "0.3.0-beta")).toBe("beta0.3");
  });

  it("没有覆盖时走构建期注入的 package.json version", () => {
    expect(resolveAppVersion(undefined, "0.3.0-beta")).toBe("0.3.0-beta");
    expect(resolveAppVersion("   ", "0.3.0-beta")).toBe("0.3.0-beta");
  });

  it("两个都没有就返回空串，徽标据此整体不渲染", () => {
    expect(resolveAppVersion(undefined, "")).toBe("");
  });

  it("构建期注入生效：当前包版本被打进产物", () => {
    expect(appVersion).toBe("0.3.0-beta");
  });
});

describe("AppVersionBadge", () => {
  it("普通页面右下角挂一个只读版本水印", () => {
    renderAt("/");

    const badge = screen.getByTitle(`当前版本 ${appVersion}`);
    expect(badge).toHaveTextContent(appVersion);
    // 只读水印：不进 tab 序、不是可交互角色
    expect(badge.tagName).toBe("SPAN");
    expect(badge).not.toHaveAttribute("tabindex");
  });

  it.each(["/dashboard-editor", "/dashboard-view"])(
    "全屏画布页 %s 不挂，避免压住右下角控件",
    (pathname) => {
      renderAt(pathname);

      expect(screen.queryByTitle(`当前版本 ${appVersion}`)).not.toBeInTheDocument();
    }
  );
});
