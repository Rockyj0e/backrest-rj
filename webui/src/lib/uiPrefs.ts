const STORAGE_EFFICIENCY_KEY = "backrest:storageEfficiencyExpanded";

// localStorage can be empty or throw (private mode, blocked storage), so every access is guarded.
export const getStorageEfficiencyExpanded = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_EFFICIENCY_KEY) !== "0";
  } catch {
    return true;
  }
};

export const setStorageEfficiencyExpanded = (expanded: boolean) => {
  try {
    localStorage.setItem(STORAGE_EFFICIENCY_KEY, expanded ? "1" : "0");
  } catch {
    // preference simply isn't remembered
  }
};
