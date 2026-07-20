import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { XsRouteFallback } from "@/components/xs";
import { routeTitles } from "@/components/xs/navigation";
import { HomePage } from "@/features/home/HomePage";
import { AppLayout } from "./AppLayout";
import { DataHubSessionExpiryHandler } from "./DataHubSessionExpiryHandler";
import { ProtectedRoute } from "./ProtectedRoute";

const AnalysisPage = lazy(() => import("@/pages/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const TablePage = lazy(() => import("@/pages/TablePage").then((module) => ({ default: module.TablePage })));
const WritingPage = lazy(() => import("@/pages/WritingPage").then((module) => ({ default: module.WritingPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DashboardEditorPage = lazy(() =>
  import("@/pages/DashboardEditorPage").then((module) => ({ default: module.DashboardEditorPage }))
);
const DashboardViewPage = lazy(() =>
  import("@/pages/DashboardViewPage").then((module) => ({ default: module.DashboardViewPage }))
);
const DataDashboardPage = lazy(() =>
  import("@/pages/DataDashboardPage").then((module) => ({ default: module.DataDashboardPage }))
);
const DataManagementPage = lazy(() =>
  import("@/pages/DataManagementPage").then((module) => ({ default: module.DataManagementPage }))
);
const CloudPage = lazy(() => import("@/pages/CloudPage").then((module) => ({ default: module.CloudPage })));
const WelcomePage = lazy(() => import("@/pages/WelcomePage").then((module) => ({ default: module.WelcomePage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const AiSettingsPage = lazy(() =>
  import("@/pages/AiSettingsPage").then((module) => ({ default: module.AiSettingsPage }))
);

function AppRouteTitle() {
  const location = useLocation();

  useEffect(() => {
    document.title = `${routeTitles[location.pathname] || "星数"} · 星数`;
  }, [location.pathname]);

  return null;
}

export function AppRoutes() {
  return (
    <>
      <AppRouteTitle />
      <DataHubSessionExpiryHandler />
      <Suspense fallback={<XsRouteFallback standalone />}>
        <Routes>
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/table" element={<TablePage />} />
            <Route path="/writing" element={<WritingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings/ai" element={<AiSettingsPage />} />
            <Route path="/data-dashboard" element={<DataDashboardPage />} />
            <Route path="/data-management" element={<DataManagementPage />} />
            <Route path="/cloud" element={<CloudPage />} />
          </Route>
          <Route
            path="/dashboard-editor"
            element={<ProtectedRoute><DashboardEditorPage /></ProtectedRoute>}
          />
          <Route
            path="/dashboard-view"
            element={<ProtectedRoute><DashboardViewPage /></ProtectedRoute>}
          />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
