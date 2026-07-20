import { create } from "zustand";
import {
  clearDataHubSession,
  clearDataHubSessionExpiredNotice,
  hasDataHubSessionExpiredNotice,
  markDataHubSessionExpiredNotice,
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
  sessionExpired: boolean;
};

type DataHubAuthActions = {
  setSession: (user: DataHubLoginResponse, spaceId: number) => void;
  setAuth: (user: DataHubLoginResponse) => void;
  setCurrentSpaceId: (spaceId: number | null) => void;
  clearAuthState: () => void;
  expireAuthState: () => void;
  refreshFromStorage: () => void;
};

const initialSession = readDataHubSession();

export const useDataHubAuthStore = create<DataHubAuthState & DataHubAuthActions>((set) => ({
  token: initialSession.token,
  user: initialSession.user,
  currentSpaceId: initialSession.spaceId,
  sessionExpired: hasDataHubSessionExpiredNotice(),
  setSession: (user, spaceId) => {
    writeDataHubSession(user, spaceId);
    clearDataHubSessionExpiredNotice();
    set({ token: user.token, user, currentSpaceId: spaceId, sessionExpired: false });
  },
  setAuth: (user) => {
    writeDataHubAuth(user);
    clearDataHubSessionExpiredNotice();
    set({ token: user.token, user, sessionExpired: false });
  },
  setCurrentSpaceId: (spaceId) => {
    writeDataHubSpaceId(spaceId);
    set({ currentSpaceId: spaceId });
  },
  clearAuthState: () => {
    clearDataHubSession();
    clearDataHubSessionExpiredNotice();
    set({ token: null, user: null, currentSpaceId: null, sessionExpired: false });
  },
  expireAuthState: () => {
    markDataHubSessionExpiredNotice();
    clearDataHubSession();
    set({ token: null, user: null, currentSpaceId: null, sessionExpired: true });
  },
  refreshFromStorage: () => {
    const session = readDataHubSession();
    set({
      token: session.token,
      user: session.user,
      currentSpaceId: session.spaceId,
      sessionExpired: hasDataHubSessionExpiredNotice()
    });
  }
}));
