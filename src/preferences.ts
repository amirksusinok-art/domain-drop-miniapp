export function displayName(user: {
  username?: string | null;
  first_name?: string | null;
}) {
  return user.username ? "@" + user.username : user.first_name || "Игрок";
}
export function readPreference(key: string, fallback = false) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}
export function savePreference(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* WebView storage may be unavailable. */
  }
}
