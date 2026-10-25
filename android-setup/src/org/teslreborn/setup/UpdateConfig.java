package org.teslreborn.setup;

import java.io.File;
import java.net.URI;
import org.json.JSONObject;

/** The launcher and installer must configure the same channel before Unity boots. */
public final class UpdateConfig {
  public static JSONObject ensure(File root, String defaultFeed) throws Exception {
    File file = new File(root, "tesl-reborn-updater.json");
    JSONObject config;
    try {
      config = PackInstaller.json(file);
    } catch (Exception missing) {
      config = new JSONObject();
    }
    String before = config.toString();
    if (!config.has("enabled")) config.put("enabled", true);
    if (!config.has("safeMode")) config.put("safeMode", false);
    if (!config.has("allowLocalUpdates")) config.put("allowLocalUpdates", false);
    // Preserve a chosen channel and disabled/safe-mode settings. Repair only a
    // missing/empty feed left by builds which had no default channel.
    if (config.optString("feedUrl", "").isEmpty() && validFeed(defaultFeed))
      config.put("feedUrl", defaultFeed);
    if (!file.exists() || !before.equals(config.toString())) PackInstaller.writeJson(file, config);
    return config;
  }

  public static void enabled(File root, JSONObject config, boolean value) throws Exception {
    config.put("enabled", value);
    PackInstaller.writeJson(new File(root, "tesl-reborn-updater.json"), config);
  }

  private static boolean validFeed(String value) {
    try {
      URI uri = new URI(value);
      return "https".equals(uri.getScheme())
          && uri.getHost() != null
          && uri.getUserInfo() == null
          && uri.getQuery() == null
          && uri.getFragment() == null;
    } catch (Exception invalid) {
      return false;
    }
  }
}
