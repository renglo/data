/** Renglo user id for the signed-in console user (matches backend get_current_user). */
export function getCurrentUserId(): string {
  try {
    const tree = JSON.parse(sessionStorage.getItem("tree") || "{}") as {
      user_id?: string;
    };
    if (tree?.user_id) {
      return String(tree.user_id);
    }
    const user = JSON.parse(sessionStorage.getItem("user") || "{}") as {
      user_id?: string;
    };
    if (user?.user_id) {
      return String(user.user_id);
    }
  } catch {
    // ignore parse errors
  }
  return String(sessionStorage.getItem("cu_handle") || "");
}
