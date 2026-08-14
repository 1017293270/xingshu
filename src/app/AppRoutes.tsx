import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { XsRouteFallback, type XsRouteFallbackVariant } from "@/components/xs/XsRouteFallback";
import { resolveRouteTitle } from "@/components/xs/navigation";
import { DataHubSessionExpiryHandler } from "./DataHubSessionExpiryHandler";
import { ProtectedRoute } from "./ProtectedRoute";

const AppLayout = lazy(() => import("./AppLayout").then((module) => ({ default: module.AppLayout })));
const HomePage = lazy(() => import("@/features/home/HomePage").then((module) => ({ default: module.HomePage })));
const AnalysisPage = lazy(() => import("@/pages/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const TablePage = lazy(() => import("@/pages/TablePage").then((module) => ({ default: module.TablePage })));
const WritingPage = lazy(() => import("@/pages/WritingPage").then((module) => ({ default: module.WritingPage })));
const WritingTemplateDetailPage = lazy(() =>
  import("@/pages/WritingTemplateDetailPage").then((module) => ({ default: module.WritingTemplateDetailPage }))
);
const WritingDraftDetailPage = lazy(() =>
  import("@/pages/WritingDraftDetailPage").then((module) => ({ default: module.WritingDraftDetailPage }))
);
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
const CloudKnowledgeDetailPage = lazy(() =>
  import("@/pages/CloudKnowledgeDetailPage").then((module) => ({ default: module.CloudKnowledgeDetailPage }))
);
const WelcomePage = lazy(() => import("@/pages/WelcomePage").then((module) => ({ default: module.WelcomePage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })));
function AppRouteTitle() {
  const location = useLocation();

  useEffect(() => {
    document.title = `${resolveRouteTitle(location.pathname) || "星数"} · 星数`;
  }, [location.pathname]);

  return null;
}

export function resolveRouteFallbackVariant(pathname: string): XsRouteFallbackVariant {
  if (pathname === "/" || pathname === "/welcome" || pathname === "/login") {
    return "hero";
  }
  if (pathname === "/history" || pathname.startsWith("/cloud/")) {
    return "rows";
  }
  if (pathname === "/data-dashboard" || pathname === "/data-management") {
    return "metrics";
  }
  if (
    pathname === "/ask-data" ||
    pathname === "/ask-knowledge" ||
    pathname === "/document-lookup" ||
    pathname === "/ask-agent" ||
    pathname === "/analysis" ||
    pathname === "/dashboard-editor" ||
    pathname.startsWith("/writing/templates/") ||
    pathname.startsWith("/writing/drafts/")
  ) {
    return "workspace";
  }
  if (pathname === "/dashboard-view") {
    return "fullscreen";
  }
  return "cards";
}

function AppRouteFallback() {
  const location = useLocation();
  return <XsRouteFallback standalone variant={resolveRouteFallbackVariant(location.pathname)} />;
}

export function AppRoutes() {
  return (
    <>
      <AppRouteTitle />
      <DataHubSessionExpiryHandler />
      <Suspense fallback={<AppRouteFallback />}>
        <Routes>
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/ask-data" element={<AnalysisPage mode="ask" />} />
            <Route path="/ask-knowledge" element={<AnalysisPage mode="rag" />} />
            <Route path="/document-lookup" element={<AnalysisPage mode="document_lookup" />} />
            <Route path="/ask-agent" element={<AnalysisPage mode="agent" />} />
            <Route path="/analysis" element={<AnalysisPage mode="agent" />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/table" element={<TablePage />} />
            <Route path="/writing" element={<WritingPage />} />
            <Route path="/writing/templates/:templateId" element={<WritingTemplateDetailPage />} />
            <Route path="/writing/drafts/:draftId" element={<WritingDraftDetailPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/data-dashboard" element={<DataDashboardPage />} />
            <Route path="/data-management" element={<DataManagementPage />} />
            <Route path="/cloud" element={<CloudPage />} />
            <Route path="/cloud/:kbId" element={<CloudKnowledgeDetailPage />} />
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
