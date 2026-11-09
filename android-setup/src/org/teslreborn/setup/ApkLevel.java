package org.teslreborn.setup;

/**
 * The level of what only a new APK can change: the setup screens, the Java
 * side of the game (keyboard, gestures) and the loader. Raise it with every
 * such change, and APK_LEVEL in hook.ts with it; patches then ask phones with
 * an older APK to install a new one. APKs before this field count as 1.
 *
 * 2: password managers fill the login form.
 */
final class ApkLevel {
  static final int LEVEL = 2;

  private ApkLevel() {}
}
