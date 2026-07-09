import { requestDataHub } from "@/services/dataHubClient";
import { clearDataHubSession } from "@/services/dataHubSession";
import type { DataHubLoginRequest, DataHubLoginResponse } from "@/types/dataHub";

type DataHubRequestControl = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function loginToDataHub(
  input: DataHubLoginRequest,
  options: DataHubRequestControl = {}
): Promise<DataHubLoginResponse> {
  return requestDataHub<DataHubLoginResponse>("/api/auth/login", {
    method: "POST",
    includeAuth: false,
    body: JSON.stringify(input),
    ...options
  });

}

export function logoutDataHub() {
  clearDataHubSession();
}
