package org.teslreborn.setup;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import java.io.File;
import java.io.InputStream;
import org.json.JSONObject;

/** Invisible launcher gate. Never inflates or briefly displays the setup screen. */
public final class LaunchActivity extends Activity {
  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    Intent target = new Intent(this, ResourceActivity.class);
    try {
      JSONObject setup;
      try (InputStream in = getAssets().open("tesl-reborn/setup.json")) {
        setup = new JSONObject(new String(PackInstaller.read(in, 256 * 1024), "UTF-8"));
      }
      File root = getExternalFilesDir(null);
      if (root == null) throw new java.io.IOException("App storage is unavailable");
      PackInstaller.writeJson(
          new File(root, "tesl-reborn-setup.json"),
          new JSONObject().put("api", 1).put("debugInput", "android-key-events"));
      JSONObject choice = PackInstaller.json(new File(root, "tesl-reborn-language.json"));
      String language = choice.getString("language");
      if (choice.optBoolean("system", false)
          && !language.equals(ResourceActivity.systemLanguageCode()))
        throw new java.io.IOException("System game language changed");
      PackInstaller installer =
          new PackInstaller(root, new File(getFilesDir(), "tesl-resource-downloads"), s -> {});
      File obb = new File(getObbDir(), "main.11009." + getPackageName() + ".obb");
      if (ResourceActivity.verifiedObb(
              obb, setup, getSharedPreferences(ResourceActivity.class.getName(), 0))
          && installer.installed("common")
          && installer.installed(language)) {
        target = new Intent(Intent.ACTION_MAIN);
        target.setClassName(getPackageName(), setup.getString("gameActivity"));
        target.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
      }
    } catch (Exception ignored) {
      /* Missing/unverified data opens the installer. */
    }
    target.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
    startActivity(target);
    finish();
  }
}
