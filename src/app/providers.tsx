import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/es/locale/zh_CN";
import type { ThemeConfig } from "antd";
import type { PropsWithChildren } from "react";
import { useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { antdTheme } from "@/theme/antdTheme";
import { SessionQueryBoundary } from "./sessionQuery";

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1
      }
    }
  }));
  const reducedMotion = usePrefersReducedMotion();
  const theme = useMemo<ThemeConfig>(
    () => ({
      ...antdTheme,
      token: {
        ...antdTheme.token,
        motion: !reducedMotion
      }
    }),
    [reducedMotion]
  );

  return (
    <ConfigProvider button={{ autoInsertSpace: false }} locale={zhCN} theme={theme}>
      <QueryClientProvider client={queryClient}>
        <SessionQueryBoundary>{children}</SessionQueryBoundary>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
