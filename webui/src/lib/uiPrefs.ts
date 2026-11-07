const STORAGE_EFFICIENCY_KEY = "backrest:storageEfficiencyExpanded";
const STORAGE_EFFICIENCY_RATIO_KEY = "backrest:storageEfficiencyShowRatio";
const REPO_GROWTH_KEY = "backrest:repoGrowthExpanded";

// localStorage can be empty or throw (private mode, blocked storage), so every access is guarded.
// A flag falls back to its default when nothing is stored.
const getFlag = (key: string, def = true): boolean => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === "1";
  } catch {
    return def;
  }
};

const setFlag = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // preference simply isn't remembered
  }
};

export const getStorageEfficiencyExpanded = () =>
  getFlag(STORAGE_EFFICIENCY_KEY);
export const setStorageEfficiencyExpanded = (expanded: boolean) =>
  setFlag(STORAGE_EFFICIENCY_KEY, expanded);

export const getStorageEfficiencyShowRatio = () =>
  getFlag(STORAGE_EFFICIENCY_RATIO_KEY);
export const setStorageEfficiencyShowRatio = (show: boolean) =>
  setFlag(STORAGE_EFFICIENCY_RATIO_KEY, show);

// Hidden by default: it loads the repo's operation history when shown.
export const getRepoGrowthExpanded = () => getFlag(REPO_GROWTH_KEY, false);
export const setRepoGrowthExpanded = (expanded: boolean) =>
  setFlag(REPO_GROWTH_KEY, expanded);
