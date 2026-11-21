/** Shared UI state. The PIN is never stored here: it is read from the input at signing time. */
export const state = {
  settings: null,
  templates: [],
  modules: [],
  certs: [],
  extraModule: null,
};
