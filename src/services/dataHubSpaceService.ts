import { requestDataHub } from "@/services/dataHubClient";
import { writeDataHubSpaceId } from "@/services/dataHubSession";
import type { DataHubSpace, DataHubSpaceCreateInput } from "@/types/dataHub";

type DataHubRequestControl = {
  authToken?: string;
  signal?: AbortSignal;
  spaceId?: number | null;
  timeoutMs?: number;
};

type EnsureDataHubSpaceOptions = DataHubRequestControl & {
  persistSelection?: boolean;
};

export async function listDataHubSpaces(options: DataHubRequestControl = {}): Promise<DataHubSpace[]> {
  return requestDataHub<DataHubSpace[]>("/api/spaces", options);
}

export async function createDataHubSpace(
  input: DataHubSpaceCreateInput,
  options: DataHubRequestControl = {}
): Promise<DataHubSpace> {
  return requestDataHub<DataHubSpace>("/api/spaces", {
    method: "POST",
    body: JSON.stringify(input),
    ...options
  });
}

export function selectDataHubSpace(spaceId: number | null) {
  writeDataHubSpaceId(spaceId);
}

export async function ensureDataHubSpace(
  username: string,
  options: EnsureDataHubSpaceOptions = {}
): Promise<DataHubSpace> {
  const { persistSelection = true, ...requestOptions } = options;
  const spaces = await listDataHubSpaces(requestOptions);
  const firstSpace = spaces[0];

  if (firstSpace) {
    if (persistSelection) {
      writeDataHubSpaceId(firstSpace.id);
    }
    return firstSpace;
  }

  const space = await createDataHubSpace({ spaceName: `${username}的空间` }, requestOptions);
  if (persistSelection) {
    writeDataHubSpaceId(space.id);
  }
  return space;
}

export async function selectFirstDataHubSpace(): Promise<DataHubSpace | null> {
  const spaces = await listDataHubSpaces();
  const firstSpace = spaces[0] ?? null;
  writeDataHubSpaceId(firstSpace?.id ?? null);
  return firstSpace;
}
