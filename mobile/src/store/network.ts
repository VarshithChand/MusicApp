import { create } from 'zustand';

interface NetworkState {
  /** True once a request failed to reach the server at all, rather than coming back with an error. */
  offline: boolean;
  setOffline: (offline: boolean) => void;
}

/**
 * Whether the phone can reach the server.
 *
 * This is worked out from the requests the app already makes: fetch rejects outright when there is
 * no route to the server, while any reply at all -- even an error -- proves the connection works.
 * That avoids a native connectivity module, and it also catches the case a module would miss, where
 * the phone is on Wi-Fi that goes nowhere.
 */
export const useNetwork = create<NetworkState>((set) => ({
  offline: false,
  setOffline: (offline) => set((s) => (s.offline === offline ? s : { offline })),
}));
