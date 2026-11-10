package org.teslreborn.setup;

/**
 * The level of what only a new APK can change: the setup screens, the Java
 * side of the game (keyboard, gestures) and the loader. Raise it with every
 * such change, and APK_LEVEL in hook.ts with it; patches then ask phones with
 * an older APK to install a new one. APKs before this field count as 1.
 *
 * 2: password managers fill the login form; the game can ask to be restarted
 *    (teslreborn://language?apply=1&restart=1) to apply a downloaded patch.
 */
final class ApkLevel {
  static final int LEVEL = 2;

  private ApkLevel() {}

  /**
   * The game reached from recents after installing a new APK skips the
   * launcher, which writes the level; without this the patch would still
   * ask for the APK just installed. Run off the main thread.
   */
  static void refresh(android.content.Context context) {
    try {
      java.io.File root = context.getExternalFilesDir(null);
      if (root == null) return;
      java.io.File file = new java.io.File(root, "tesl-reborn-setup.json");
      if (!file.isFile()) return;
      org.json.JSONObject setup = PackInstaller.json(file);
      if (setup.optInt("apkLevel", 1) == LEVEL) return;
      PackInstaller.writeJson(file, setup.put("apkLevel", LEVEL));
    } catch (Exception ignored) {
      // The notice stays until the launcher runs again.
    }
  }
}
