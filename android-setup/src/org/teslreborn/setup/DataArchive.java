package org.teslreborn.setup;

import java.io.*;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/** Streaming import of the builder's data ZIP; no full archive staging copy. */
public final class DataArchive {
  public interface ObbSink {
    void install(InputStream in, JSONObject metadata) throws Exception;
  }

  public static void install(
      InputStream source,
      JSONObject expectedObb,
      File temporary,
      PackInstaller installer,
      ObbSink obbSink,
      PackInstaller.Progress progress)
      throws Exception {
    try (ZipInputStream zip = new ZipInputStream(source)) {
      PackInstaller.mkdir(temporary);
      ZipEntry first = zip.getNextEntry();
      if (first == null || !"catalog.json".equals(first.getName()))
        throw new IOException(
            "Select the data ZIP produced by the builder (catalog must be first)");
      JSONObject catalog = new JSONObject(new String(PackInstaller.read(zip, 256 * 1024), "UTF-8"));
      PackInstaller.validateCatalog(catalog);
      JSONObject obb = catalog.getJSONObject("obb");
      if (expectedObb != null
          && (!expectedObb.getString("sha256").equals(obb.getString("sha256"))
              || expectedObb.getLong("bytes") != obb.getLong("bytes")))
        throw new IOException("This archive belongs to another base game version");
      Map<String, JSONObject> allowed = new HashMap<>();
      allowed.put("game.obb", obb);
      JSONArray packs = catalog.getJSONArray("packs");
      for (int i = 0; i < packs.length(); i++) {
        JSONObject pack = packs.getJSONObject(i);
        if (allowed.put(pack.getString("path"), pack) != null)
          throw new IOException("Duplicate archive path");
      }
      Set<String> seen = new HashSet<>();
      seen.add("catalog.json");
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        String name = entry.getName();
        JSONObject metadata = allowed.get(name);
        if (metadata == null || entry.isDirectory() || !seen.add(name))
          throw new IOException("Unexpected or duplicate archive entry");
        if (seen.size() == 2 && !"game.obb".equals(name))
          throw new IOException("Base game data must precede language packs");
        long bytes = metadata.getLong("bytes");
        if (entry.getSize() >= 0 && entry.getSize() != bytes)
          throw new IOException("Unexpected entry size");
        BoundedEntry in = new BoundedEntry(zip, bytes);
        progress.show("Importing " + metadata.getString("id"));
        if ("game.obb".equals(name)) obbSink.install(in, metadata);
        else {
          File file = new File(temporary, metadata.getString("sha256") + ".import");
          try {
            if (temporary.getUsableSpace() < bytes + 32L * 1024 * 1024)
              throw new IOException("Not enough space to import language pack");
            try (FileOutputStream out = new FileOutputStream(file)) {
              byte[] buffer = new byte[256 * 1024];
              int n;
              while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
              out.getFD().sync();
            }
            if (!PackInstaller.hash(file).equals(metadata.getString("sha256")))
              throw new IOException("Corrupt pack in data ZIP");
            installer.install(file, metadata);
            installer.verifyInstalled(metadata.getString("id"));
          } finally {
            file.delete();
          }
        }
        // Includes an EOF read, which checks both the declared bound and ZIP CRC.
        byte[] drain = new byte[8192];
        while (in.read(drain) != -1) {}
        zip.closeEntry();
      }
      if (seen.size() != allowed.size() + 1) throw new IOException("The data ZIP is incomplete");
    }
  }

  private static final class BoundedEntry extends InputStream {
    private final InputStream in;
    private final long expected;
    private long count;

    BoundedEntry(InputStream in, long expected) {
      this.in = in;
      this.expected = expected;
    }

    @Override
    public int read(byte[] buffer, int offset, int size) throws IOException {
      if (Thread.currentThread().isInterrupted())
        throw new InterruptedIOException("Import interrupted");
      if (size == 0) return 0;
      int n = in.read(buffer, offset, (int) Math.min(size, Math.max(1, expected - count + 1)));
      if (n < 0) {
        if (count != expected) throw new IOException("Truncated archive entry");
        return -1;
      }
      count += n;
      if (count > expected) throw new IOException("Oversized archive entry");
      return n;
    }

    @Override
    public int read() throws IOException {
      byte[] one = new byte[1];
      return read(one, 0, 1) < 0 ? -1 : one[0] & 255;
    }

    @Override
    public void close() {} // The archive owner closes the source, not a per-entry installer.
  }
}
