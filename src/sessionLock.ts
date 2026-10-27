interface PlayerTabLockState {
  acquisition: Promise<void>;
  // Retain the request as well as its acquisition handshake for the document lifetime.
  request?: Promise<void>;
}

declare global {
  interface Window {
    __game2025PlayerTabLock?: PlayerTabLockState;
  }
}

const LOCK_NAME = '2025-player-session';
const OTHER_TAB_MESSAGE = 'This table is already open in another tab. Close the other game tab, then retry.';

/** Acquire once per document, before replaying saves or reconciling interrupted runs. */
export function acquirePlayerTabLock(): Promise<void> {
  if (window.__game2025PlayerTabLock) return window.__game2025PlayerTabLock.acquisition;
  if (!navigator.locks?.request) return Promise.reject(new Error('This game needs a browser with Web Locks support to protect your records between tabs. Use a current Chrome, Edge, Firefox, or Safari browser over HTTPS or localhost.'));

  let acquired!: () => void;
  let refused!: (reason: unknown) => void;
  const acquisition = new Promise<void>((resolve, reject) => { acquired = resolve; refused = reject; });
  const state: PlayerTabLockState = { acquisition };
  window.__game2025PlayerTabLock = state;

  const rejectAcquisition = (reason: unknown) => {
    // Only clear this attempt; an old failed request must not erase a later retry.
    if (window.__game2025PlayerTabLock === state) delete window.__game2025PlayerTabLock;
    refused(reason instanceof Error ? reason : new Error('Could not protect this player session. Please retry.'));
  };
  try {
    state.request = navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) {
        rejectAcquisition(new Error(OTHER_TAB_MESSAGE));
        return;
      }
      acquired();
      // The browser releases this lock when the document is destroyed. Component
      // remounts and hot module replacement must keep ownership of the session.
      return new Promise<void>(() => {});
    }).then(() => undefined, rejectAcquisition);
  } catch (error) { rejectAcquisition(error); }
  return acquisition;
}
