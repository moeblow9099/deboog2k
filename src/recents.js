import { state } from "./state.js";

export function recentItems() {
  return state.items
    .filter((item) => !item.deletedAt)
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function deletedItems() {
  return state.items
    .filter((item) => item.deletedAt)
    .slice()
    .sort((a, b) => b.deletedAt - a.deletedAt);
}
