package org.teslreborn.setup;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Map;

/** Both the browser installation QR and the legacy in-app QR identify one transfer. */
public final class ConnectionLink {
  public static String resourceUri(String text) throws Exception {
    URI uri = new URI(text);
    String base, token;
    if ("teslreborn".equals(uri.getScheme()) && "resources".equals(uri.getHost())) {
      Map<String, String> values = new HashMap<>();
      for (String pair : (uri.getRawQuery() == null ? "" : uri.getRawQuery()).split("&")) {
        String[] parts = pair.split("=", 2);
        if (parts.length == 2) {
          String key = URLDecoder.decode(parts[0], "UTF-8");
          if (values.put(key, URLDecoder.decode(parts[1], "UTF-8")) != null)
            throw new IOException("Duplicate connection field");
        }
      }
      base = values.get("url");
      token = values.get("token");
    } else if (("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
        && uri.getRawQuery() == null
        && uri.getRawFragment() == null
        && uri.getRawUserInfo() == null) {
      String path = uri.getRawPath();
      int marker = path.lastIndexOf("/connect/");
      if (marker < 0) throw new IOException("Not a TESL Reborn connection QR");
      token = path.substring(marker + 9);
      base =
          new URI(
                  uri.getScheme(),
                  uri.getRawAuthority(),
                  path.substring(0, marker) + "/",
                  null,
                  null)
              .toString();
    } else throw new IOException("Not a TESL Reborn connection QR");
    if (base == null || token == null || !token.matches("[A-Za-z0-9_-]{20,128}"))
      throw new IOException("Invalid connection code");
    PackInstaller.baseUrl(base);
    return "teslreborn://resources?url=" + URLEncoder.encode(base, "UTF-8") + "&token=" + token;
  }
}
