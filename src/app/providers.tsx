import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import type { ThemeConfig } from "antd";
import type { PropsWithChildren } from "react";
import { useMemo, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { antdTheme } from "@/theme/antdTheme";

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
    <ConfigProvider button={{ autoInsertSpace: false }} theme={theme}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  );
}
