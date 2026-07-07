import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "@/features/home/HomePage";
import { ProtectedRoute } from "./ProtectedRoute";

const AnalysisPage = lazy(() => import("@/pages/AnalysisPage").then((module) => ({ default: module.AnalysisPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const TablePage = lazy(() => import("@/pages/TablePage").then((module) => ({ default: module.TablePage })));
const WritingPage = lazy(() => import("@/pages/WritingPage").then((module) => ({ default: module.WritingPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DataDashboardPage = lazy(() =>
  import("@/pages/DataDashboardPage").then((module) => ({ default: module.DataDashboardPage }))
);
const DataManagementPage = lazy(() =>
  import("@/pages/DataManagementPage").then((module) => ({ default: module.DataManagementPage }))
);
const CloudPage = lazy(() => import("@/pages/CloudPage").then((module) => ({ default: module.CloudPage })));
const WelcomePage = lazy(() => import("@/pages/WelcomePage").then((module) => ({ default: module.WelcomePage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })));

export function AppRoutes() {
  const protectedElement = (element: ReactNode) => <ProtectedRoute>{element}</ProtectedRoute>;

  return (
    <Suspense fallback={<div className="route-loading" role="status">页面加载中</div>}>
      <Routes>
        <Route path="/" element={protectedElement(<HomePage />)} />
        <Route path="/analysis" element={protectedElement(<AnalysisPage />)} />
        <Route path="/history" element={protectedElement(<HistoryPage />)} />
        <Route path="/table" element={protectedElement(<TablePage />)} />
        <Route path="/writing" element={protectedElement(<WritingPage />)} />
        <Route path="/dashboard" element={protectedElement(<DashboardPage />)} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/data-dashboard" element={protectedElement(<DataDashboardPage />)} />
        <Route path="/data-management" element={protectedElement(<DataManagementPage />)} />
        <Route path="/cloud" element={protectedElement(<CloudPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
