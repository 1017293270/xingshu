import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useDataHubAuthStore } from "@/stores/dataHubAuthStore";
import { ProtectedRoute } from "./ProtectedRoute";

function LoginLocationProbe() {
  const location = useLocation();
  return <output aria-label="登录回跳地址">{String((location.state as { from?: unknown } | null)?.from || "")}</output>;
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    localStorage.clear();
    useDataHubAuthStore.getState().clearAuthState();
  });

  it("preserves the full internal URL when redirecting to login", async () => {
    render(
      <MemoryRouter initialEntries={["/data-management?scope=mine#recent"]}>
        <Routes>
          <Route
            path="/data-management"
            element={
              <ProtectedRoute>
                <div>受保护页面</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginLocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByLabelText("登录回跳地址")).toHaveTextContent(
      "/data-management?scope=mine#recent"
    );
  });
});
