const listeners = new Set();

export const state = {
  buildVersion: "deboog2k3",
  ready: false,
  currentFolderId: null,
  query: "",
  folders: [],
  items: [],
  status: ""
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}
