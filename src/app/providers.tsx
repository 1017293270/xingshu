import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import type { PropsWithChildren } from "react";
import { antdTheme } from "@/theme/antdTheme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  }
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConfigProvider button={{ autoInsertSpace: false }} theme={antdTheme}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  );
}
