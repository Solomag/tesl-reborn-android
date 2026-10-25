package org.teslreborn.setup;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/** Streaming downloads and verified, receipt-last resource installation. API 26+. */
public final class PackInstaller {
  public interface Progress {
    void show(String text);
  }

  private final File root, privateDownloads, receipts;
  private final Progress progress;

  public PackInstaller(File root, File downloads, Progress progress) throws IOException {
    this.root = root;
    this.privateDownloads = downloads;
    this.progress = progress;
    this.receipts = new File(root, ".tesl-resources");
    mkdir(root);
    mkdir(downloads);
    mkdir(receipts);
  }

  public static void migrateDownloads(File oldDirectory, File directory) throws IOException {
    mkdir(directory);
    File[] old = oldDirectory.listFiles();
    if (old == null) return;
    for (File file : old) {
      if (!file.isFile() || !file.getName().matches("[a-f0-9]{64}\\.part")) continue;
      File target = new File(directory, file.getName());
      if (!target.exists() || target.length() < file.length()) atomic(file, target);
    }
  }

  static void mkdir(File f) throws IOException {
    if (!f.isDirectory() && !f.mkdirs()) throw new IOException("Cannot create storage directory");
  }

  static String hex(byte[] data) {
    StringBuilder b = new StringBuilder();
    for (byte v : data) b.append(String.format(Locale.ROOT, "%02x", v & 255));
    return b.toString();
  }

  public static String hash(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    byte[] buffer = new byte[1024 * 1024];
    try (InputStream in = new FileInputStream(file)) {
      int n;
      while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n);
    }
    return hex(digest.digest());
  }

  static byte[] read(InputStream in, int limit) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] b = new byte[8192];
    int n;
    while ((n = in.read(b)) != -1) {
      if (out.size() + n > limit) throw new IOException("Metadata exceeds limit");
      out.write(b, 0, n);
    }
    return out.toByteArray();
  }

  static JSONObject json(File file) throws Exception {
    try (InputStream in = new FileInputStream(file)) {
      return new JSONObject(new String(read(in, 8 * 1024 * 1024), "UTF-8"));
    }
  }

  static void atomic(File from, File to) throws IOException {
    mkdir(to.getParentFile());
    try {
      Files.move(
          from.toPath(),
          to.toPath(),
          StandardCopyOption.REPLACE_EXISTING,
          StandardCopyOption.ATOMIC_MOVE);
    } catch (AtomicMoveNotSupportedException e) {
      Files.move(from.toPath(), to.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
  }

  static void writeJson(File file, JSONObject object) throws Exception {
    File temp = new File(file.getPath() + ".tmp");
    mkdir(file.getParentFile());
    try (FileOutputStream out = new FileOutputStream(temp)) {
      out.write(object.toString().getBytes("UTF-8"));
      out.getFD().sync();
    }
    atomic(temp, file);
  }

  static String id(JSONObject pack) throws Exception {
    String value = pack.getString("id");
    if (!value.matches("common|en_us|de_de|es_es|es_mx|fr_fr|it_it|pl_pl|pt_br|ru_ru|tr_tr"))
      throw new IOException("Unknown language pack");
    return value;
  }

  static void validate(JSONObject pack) throws Exception {
    id(pack);
    if (!pack.getString("sha256").matches("[a-f0-9]{64}")
        || pack.getLong("bytes") < 1
        || pack.getLong("bytes") > 1024L * 1024 * 1024
        || pack.getLong("unpackedBytes") < 1
        || pack.getLong("unpackedBytes") > 1024L * 1024 * 1024)
      throw new IOException("Invalid resource limits/hash");
    if (!pack.getString("path").equals("packs/" + pack.getString("sha256") + ".zip"))
      throw new IOException("Invalid pack URL");
  }

  public static URL baseUrl(String text) throws Exception {
    URL url = new URL(text.endsWith("/") ? text : text + "/");
    if (url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null)
      throw new IOException("The address must not include credentials, query or fragment");
    if (url.getProtocol().equals("http")) {
      // Only numeric private IPv4 HTTP endpoints: no DNS rebinding or public plaintext bearer
      // tokens.
      if (!url.getHost().matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+"))
        throw new IOException(
            "For Wi-Fi or Tailscale, use the numeric address shown by the PC builder");
      InetAddress ip = InetAddress.getByName(url.getHost());
      if (!ip.isSiteLocalAddress() && !ip.isLoopbackAddress() && !tailscale(ip))
        throw new IOException(
            "This is not a Wi-Fi or Tailscale address. Select your Wi-Fi address in the PC builder,"
                + " or use Tailscale on both devices.");
    } else if (!url.getProtocol().equals("https"))
      throw new IOException("Use a Wi-Fi/Tailscale HTTP address or an HTTPS address");
    return url;
  }

  private static boolean tailscale(InetAddress ip) {
    byte[] b = ip.getAddress();
    return b.length == 4 && (b[0] & 255) == 100 && (b[1] & 255) >= 64 && (b[1] & 255) <= 127;
  }

  static void validateObb(JSONObject obb) throws Exception {
    if (!"obb".equals(obb.getString("id"))
        || !"game.obb".equals(obb.getString("path"))
        || !obb.getString("sha256").matches("[a-f0-9]{64}")
        || obb.getLong("bytes") < 1
        || obb.getLong("bytes") > 4L * 1024 * 1024 * 1024)
      throw new IOException("Invalid base game data");
  }

  private static HttpURLConnection connect(URL base, String path, String token) throws Exception {
    if (path.contains("..") || path.startsWith("/") || path.contains(":"))
      throw new IOException("Invalid resource endpoint");
    HttpURLConnection c = (HttpURLConnection) new URL(base, path).openConnection();
    c.setUseCaches(false);
    c.setRequestProperty("Cache-Control", "no-cache");
    c.setInstanceFollowRedirects(false);
    c.setConnectTimeout(15000);
    c.setReadTimeout(90000);
    c.setRequestProperty("Accept-Encoding", "identity");
    if (!token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
    return c;
  }

  public JSONObject catalog(URL base, String token) throws Exception {
    for (int attempt = 0; ; attempt++) {
      try {
        return catalogOnce(base, token);
      } catch (IOException error) {
        String message = String.valueOf(error.getMessage());
        if (attempt >= 7
            || Thread.currentThread().isInterrupted()
            || message.contains("HTTP 401")
            || message.contains("HTTP 403")
            || message.contains("HTTP 404")) throw error;
        progress.show("Connecting to PC again…");
        Thread.sleep(Math.min(10000, 1000L << attempt));
      }
    }
  }

  private JSONObject catalogOnce(URL base, String token) throws Exception {
    HttpURLConnection c = connect(base, "catalog.json", token);
    try {
      if (c.getResponseCode() != 200) throw new IOException("Catalog: HTTP " + c.getResponseCode());
      JSONObject value;
      try (InputStream in = c.getInputStream()) {
        value = new JSONObject(new String(read(in, 256 * 1024), "UTF-8"));
        if (value.has("obb")) validateObb(value.getJSONObject("obb"));
      }
      validateCatalog(value);
      return value;
    } finally {
      c.disconnect();
    }
  }

  public static void validateCatalog(JSONObject value) throws Exception {
    if (value.has("obb")) validateObb(value.getJSONObject("obb"));
    if (value.getInt("schema") != 1
        || !value.getString("format").equals("tesl-reborn-resources-v1")
        || value.getInt("gameVersionCode") != 11009
        || !value.getString("abi").equals("arm64-v8a"))
      throw new IOException("Incompatible catalog");
    JSONArray packs = value.getJSONArray("packs");
    if (packs.length() > 11) throw new IOException("Too many packs");
    Set<String> ids = new HashSet<>();
    for (int i = 0; i < packs.length(); i++) {
      JSONObject p = packs.getJSONObject(i);
      validate(p);
      if (!ids.add(id(p))) throw new IOException("Duplicate pack");
    }
    if (!ids.contains("common"))
      throw new IOException("Common resources are missing from this build");
  }

  public File download(URL base, String token, JSONObject pack) throws Exception {
    // Retain the partial file across failures, activity restarts and server sessions.
    int failures = 0;
    long previous = -1;
    while (true) {
      try {
        return downloadOnce(base, token, pack);
      } catch (IOException error) {
        if (Thread.currentThread().isInterrupted()) throw error;
        String message = String.valueOf(error.getMessage());
        if (message.contains("HTTP 401")
            || message.contains("HTTP 403")
            || message.contains("HTTP 404")
            || message.contains("Invalid")
            || message.contains("Unexpected response")
            || message.contains("Not enough space")
            || message.contains("Oversized")) throw error;
        File part = new File(privateDownloads, pack.getString("sha256") + ".part");
        long saved = part.length();
        if (saved > previous) {
          failures = 0;
          previous = saved;
        }
        if (++failures > 20)
          throw new IOException(
              "Connection is unavailable. Downloaded progress is saved; tap Download to resume.",
              error);
        long delay = Math.min(15000, 1000L << Math.min(failures - 1, 4));
        progress.show(
            "Connection interrupted. Saved "
                + saved / (1024 * 1024)
                + " MB; retrying in "
                + delay / 1000
                + " s…");
        Thread.sleep(delay);
      }
    }
  }

  private File downloadOnce(URL base, String token, JSONObject pack) throws Exception {
    if ("obb".equals(pack.optString("id"))) validateObb(pack);
    else validate(pack);
    File part = new File(privateDownloads, pack.getString("sha256") + ".part");
    long expected = pack.getLong("bytes"), offset = part.isFile() ? part.length() : 0;
    if (offset > expected) {
      if (!part.delete()) throw new IOException("Cannot reset partial file");
      offset = 0;
    }
    if (offset == expected) {
      if (hash(part).equals(pack.getString("sha256"))) return part;
      if (!part.delete()) throw new IOException("Cannot reset corrupt download");
      offset = 0;
    }
    HttpURLConnection c = connect(base, pack.getString("path"), token);
    if (offset > 0) {
      c.setRequestProperty("Range", "bytes=" + offset + "-");
      c.setRequestProperty("If-Range", "\"" + pack.getString("sha256") + "\"");
    }
    try {
      int status = c.getResponseCode();
      if (status == 200) offset = 0;
      else if (status == 206 && offset > 0) {
        String range = c.getHeaderField("Content-Range");
        if (!("bytes " + offset + "-" + (expected - 1) + "/" + expected).equals(range))
          throw new IOException("Invalid resumed range");
      } else throw new IOException("Download: HTTP " + status);
      long size = c.getContentLengthLong();
      if (size >= 0 && size != expected - offset) throw new IOException("Unexpected response size");
      if (privateDownloads.getUsableSpace() < expected - offset + 32L * 1024 * 1024)
        throw new IOException("Not enough space for the download");
      try (InputStream in = c.getInputStream();
          FileOutputStream out = new FileOutputStream(part, offset > 0)) {
        byte[] buffer = new byte[256 * 1024];
        int n;
        long total = offset, last = 0;
        while ((n = in.read(buffer)) != -1) {
          if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
          total += n;
          if (total > expected) throw new IOException("Oversized download");
          out.write(buffer, 0, n);
          long now = System.currentTimeMillis();
          if (now - last > 300) {
            progress.show(
                "Downloading " + pack.getString("id") + ": " + (total * 100 / expected) + "%");
            last = now;
          }
        }
        out.getFD().sync();
        if (total != expected) throw new IOException("Download interrupted; retry to resume");
      }
    } finally {
      c.disconnect();
    }
    if (!hash(part).equals(pack.getString("sha256"))) {
      part.delete();
      throw new IOException("The downloaded file failed SHA-256 verification");
    }
    return part;
  }

  private File target(File directory, String path) throws Exception {
    if (!path.equals("versions.json")
        && !path.matches(
            "tesl-localization-(en_us|de_de|es_es|es_mx|fr_fr|it_it|pl_pl|pt_br|ru_ru|tr_tr)\\.json")
        && !path.matches("UnityCache/Shared/[A-Za-z0-9_.-]+/[a-fA-F0-9]{1,32}/__(data|info)"))
      throw new IOException("Unsafe cache entry");
    File file = new File(directory, path);
    if (!file.getCanonicalPath().startsWith(directory.getCanonicalPath() + File.separator))
      throw new IOException("Path escapes resource root");
    return file;
  }

  public boolean installed(String packId) {
    try {
      JSONObject r = json(new File(receipts, packId + ".json"));
      JSONArray files = r.getJSONArray("files");
      for (int i = 0; i < files.length(); i++) {
        JSONObject e = files.getJSONObject(i);
        File f = target(root, e.getString("path"));
        if (!f.isFile() || f.length() == 0) return false;
        if (!e.getString("path").endsWith("/__info") && f.length() != e.getLong("bytes"))
          return false;
      }
      return files.length() > 0;
    } catch (Exception e) {
      return false;
    }
  }

  public void verifyInstalled(String packId) throws Exception {
    if (!installed(packId)) throw new IOException("Missing resources for " + packId);
    JSONArray files = json(new File(receipts, packId + ".json")).getJSONArray("files");
    for (int i = 0; i < files.length(); i++) {
      JSONObject e = files.getJSONObject(i);
      if (e.getString("path").endsWith("/__info")) continue; // Unity updates access metadata.
      if (!hash(target(root, e.getString("path"))).equals(e.getString("sha256"))) {
        new File(receipts, packId + ".json").delete();
        throw new IOException(
            "Resource verification failed for " + packId + ". Install or download it again.");
      }
    }
  }

  public String installedHash(String packId) throws Exception {
    return json(new File(receipts, packId + ".json")).getString("packSha256");
  }

  public void install(File file, JSONObject pack) throws Exception {
    validate(pack);
    String packId = id(pack);
    if (installed(packId) && installedHash(packId).equals(pack.getString("sha256"))) return;
    if (file.length() != pack.getLong("bytes") || !hash(file).equals(pack.getString("sha256")))
      throw new IOException("The pack is corrupt");
    File stage = new File(receipts, "staging/" + pack.getString("sha256"));
    deleteTree(stage);
    mkdir(stage);
    try (ZipFile zip = new ZipFile(file)) {
      ZipEntry first = zip.getEntry("pack.json");
      if (first == null || first.getSize() > 8 * 1024 * 1024)
        throw new IOException("Invalid pack manifest");
      JSONObject manifest;
      try (InputStream in = zip.getInputStream(first)) {
        manifest = new JSONObject(new String(read(in, 8 * 1024 * 1024), "UTF-8"));
      }
      if (manifest.getInt("schema") != 1
          || !manifest.getString("format").equals("tesl-reborn-pack-v1")
          || manifest.getInt("gameVersionCode") != 11009
          || !id(manifest).equals(packId)) throw new IOException("Incompatible pack");
      JSONArray files = manifest.getJSONArray("files");
      if (files.length() < 1 || files.length() > 20000) throw new IOException("Invalid file count");
      Set<String> names = new HashSet<>();
      names.add("pack.json");
      long bytes = 0;
      for (int i = 0; i < files.length(); i++) {
        JSONObject entry = files.getJSONObject(i);
        String path = entry.getString("path");
        target(stage, path);
        if (!names.add(path)
            || entry.getLong("bytes") < 1
            || entry.getLong("bytes") > 512L * 1024 * 1024
            || !entry.getString("sha256").matches("[a-f0-9]{64}"))
          throw new IOException("Invalid file metadata");
        if (path.equals("versions.json") && !packId.equals("common"))
          throw new IOException("Language pack overrides inventory");
        if (path.startsWith("tesl-localization-")
            && !path.equals("tesl-localization-" + packId + ".json"))
          throw new IOException("Localization belongs to another language");
        bytes += entry.getLong("bytes");
        if (bytes > pack.getLong("unpackedBytes"))
          throw new IOException("Unpacked size exceeds limit");
      }
      if (bytes != pack.getLong("unpackedBytes") || zip.size() != names.size())
        throw new IOException("Pack contents differ from manifest");
      Set<String> actual = new HashSet<>();
      Enumeration<? extends ZipEntry> all = zip.entries();
      while (all.hasMoreElements()) {
        String n = all.nextElement().getName();
        if (!actual.add(n) || !names.contains(n))
          throw new IOException("Unexpected or duplicate ZIP entry");
      }
      if (root.getUsableSpace() < bytes + 32L * 1024 * 1024)
        throw new IOException("Not enough space to install the pack");
      for (int i = 0; i < files.length(); i++) {
        JSONObject entry = files.getJSONObject(i);
        String path = entry.getString("path");
        ZipEntry z = zip.getEntry(path);
        if (z == null || z.getSize() != entry.getLong("bytes"))
          throw new IOException("Missing/invalid cache entry");
        File out = target(stage, path);
        mkdir(out.getParentFile());
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long written = 0;
        try (InputStream in = zip.getInputStream(z);
            FileOutputStream stream = new FileOutputStream(out)) {
          byte[] buffer = new byte[256 * 1024];
          int n;
          while ((n = in.read(buffer)) != -1) {
            written += n;
            if (written > entry.getLong("bytes")) throw new IOException("Oversized cache entry");
            stream.write(buffer, 0, n);
            digest.update(buffer, 0, n);
          }
          stream.getFD().sync();
        }
        if (written != entry.getLong("bytes")
            || !hex(digest.digest()).equals(entry.getString("sha256")))
          throw new IOException("A resource file is corrupt");
        if (i % 25 == 0) progress.show("Checking " + packId + ": " + i + "/" + files.length());
      }
      File receipt = new File(receipts, packId + ".json");
      if (receipt.exists() && !receipt.delete())
        throw new IOException("Cannot invalidate old receipt");
      for (int i = 0; i < files.length(); i++) {
        String path = files.getJSONObject(i).getString("path");
        atomic(target(stage, path), target(root, path));
      }
      manifest.put("packSha256", pack.getString("sha256"));
      writeJson(receipt, manifest);
    } finally {
      deleteTree(stage);
    }
  }

  public void remove(String packId) throws Exception {
    if (packId.equals("common")) throw new IOException("Common resources cannot be removed");
    File receipt = new File(receipts, packId + ".json");
    JSONObject current = json(receipt);
    Set<String> retained = new HashSet<>();
    File[] others = receipts.listFiles();
    if (others != null)
      for (File other : others) {
        if (other.equals(receipt) || !other.getName().endsWith(".json")) continue;
        JSONArray files = json(other).getJSONArray("files");
        for (int i = 0; i < files.length(); i++)
          retained.add(files.getJSONObject(i).getString("path"));
      }
    if (!receipt.delete()) throw new IOException("Cannot remove receipt");
    JSONArray files = current.getJSONArray("files");
    for (int i = 0; i < files.length(); i++) {
      String path = files.getJSONObject(i).getString("path");
      if (!retained.contains(path)) {
        File f = target(root, path);
        if (f.exists() && !f.delete()) throw new IOException("Cannot remove cache entry");
      }
    }
  }

  public void complete(URL base, String token, String language) throws Exception {
    JSONObject installed =
        new JSONObject()
            .put("common", installedHash("common"))
            .put(language, installedHash(language));
    complete(base, token, installed, "");
  }

  public void complete(URL base, String token, JSONObject installed, String obbHash)
      throws Exception {
    byte[] body =
        new JSONObject()
            .put("installed", installed)
            .put("obb", obbHash)
            .toString()
            .getBytes("UTF-8");
    HttpURLConnection c = connect(base, "complete", token);
    try {
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setFixedLengthStreamingMode(body.length);
      c.setRequestProperty("Content-Type", "application/json");
      try (OutputStream out = c.getOutputStream()) {
        out.write(body);
      }
      if (c.getResponseCode() != 204) throw new IOException("The PC did not confirm completion");
    } finally {
      c.disconnect();
    }
  }

  static void deleteTree(File path) throws IOException {
    if (!path.exists()) return;
    if (Files.isSymbolicLink(path.toPath())) throw new IOException("Symlink in staging directory");
    File[] children = path.listFiles();
    if (children != null) for (File child : children) deleteTree(child);
    if (!path.delete()) throw new IOException("Cannot remove staging file");
  }
}
