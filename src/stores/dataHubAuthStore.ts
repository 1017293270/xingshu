import { create } from "zustand";
import {
  clearDataHubSession,
  readDataHubSession,
  writeDataHubAuth,
  writeDataHubSession,
  writeDataHubSpaceId
} from "@/services/dataHubSession";
import type { DataHubLoginResponse } from "@/types/dataHub";

type DataHubAuthState = {
  token: string | null;
  user: DataHubLoginResponse | null;
  currentSpaceId: number | null;
};

type DataHubAuthActions = {
  setSession: (user: DataHubLoginResponse, spaceId: number) => void;
  setAuth: (user: DataHubLoginResponse) => void;
  setCurrentSpaceId: (spaceId: number | null) => void;
  clearAuthState: () => void;
  refreshFromStorage: () => void;
};

const initialSession = readDataHubSession();

export const useDataHubAuthStore = create<DataHubAuthState & DataHubAuthActions>((set) => ({
  token: initialSession.token,
  user: initialSession.user,
  currentSpaceId: initialSession.spaceId,
  setSession: (user, spaceId) => {
    writeDataHubSession(user, spaceId);
    set({ token: user.token, user, currentSpaceId: spaceId });
  },
  setAuth: (user) => {
    writeDataHubAuth(user);
    set({ token: user.token, user });
  },
  setCurrentSpaceId: (spaceId) => {
    writeDataHubSpaceId(spaceId);
    set({ currentSpaceId: spaceId });
  },
  clearAuthState: () => {
    clearDataHubSession();
    set({ token: null, user: null, currentSpaceId: null });
  },
  refreshFromStorage: () => {
    const session = readDataHubSession();
    set({
      token: session.token,
      user: session.user,
      currentSpaceId: session.spaceId
    });
  }
}));
