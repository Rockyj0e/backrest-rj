const STORAGE_EFFICIENCY_KEY = "backrest:storageEfficiencyExpanded";
const STORAGE_EFFICIENCY_RATIO_KEY = "backrest:storageEfficiencyShowRatio";

// localStorage can be empty or throw (private mode, blocked storage), so every access is guarded.
// A flag is on unless explicitly stored as "0".
const getFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
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
