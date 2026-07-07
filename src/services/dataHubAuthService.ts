import { requestDataHub } from "@/services/dataHubClient";
import { clearDataHubSession, writeDataHubAuth } from "@/services/dataHubSession";
import type { DataHubLoginRequest, DataHubLoginResponse } from "@/types/dataHub";

type DataHubRequestControl = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function loginToDataHub(
  input: DataHubLoginRequest,
  options: DataHubRequestControl = {}
): Promise<DataHubLoginResponse> {
  const user = await requestDataHub<DataHubLoginResponse>("/api/auth/login", {
    method: "POST",
    includeAuth: false,
    body: JSON.stringify(input),
    ...options
  });

  writeDataHubAuth(user);
  return user;
}

export function logoutDataHub() {
  clearDataHubSession();
}
