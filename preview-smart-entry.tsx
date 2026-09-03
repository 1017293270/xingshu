import "@ant-design/v5-patch-for-react-19";
import "@/styles/tokens.css";
import "@/components/xs/xs.css";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/app/AppLayout";
import { AppProviders } from "@/app/providers";
import { HomePage } from "@/features/home/HomePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DashboardSquarePage } from "@/pages/DashboardSquarePage";
import { SmartDashboardPage } from "@/pages/SmartDashboardPage";

/**
 * 智享大屏入口相关页面的免登录预览壳：绕过 ProtectedRoute，但保留 AppLayout 壳子，
 * 好让首页网格和入口页两栏在真实轨道宽度下取样。
 * ?page=entry|home|library|square；接口由截图脚本在网络层伪造。
 */
const page = new URLSearchParams(window.location.search).get("page") ?? "entry";
const path = page === "home" ? "/" : page === "library" ? "/dashboard" : page === "square" ? "/dashboard/square" : "/dashboard/smart";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/square" element={<DashboardSquarePage />} />
            <Route path="/dashboard/smart" element={<SmartDashboardPage />} />
            <Route path="/dashboard-editor" element={<p data-testid="editor-stub">编辑器占位</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AppProviders>
  </StrictMode>
);
