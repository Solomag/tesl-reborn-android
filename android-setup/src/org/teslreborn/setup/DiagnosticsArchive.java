package org.teslreborn.setup;

import java.io.*;
import java.util.*;
import java.util.zip.*;

/** Fixed allowlist, bounded input and redaction before any file is shared. */
public final class DiagnosticsArchive {
  private static final String[] SNAPSHOTS = {
    "tesl-reborn-language.json", "tesl-reborn-language-state.json",
    "tesl-reborn-update-status.json", "tesl-reborn-setup.json", "tesl-reborn-handoff.json",
    "tesl-reborn-ui-status.json", "tesl-reborn-update-notice.json", "tesl-reborn-resource-status.json"
  };
  private static final String[] LOGS = {"current.log", "previous.log", "older.log", "previous-3.log", "previous-4.log", "previous-5.log", "previous-6.log", "previous-7.log", "previous-8.log", "previous-9.log", "native.log", "native-previous.log"};
  private static final int LIMIT = 256 * 1024;

  public static String redact(String value) {
    return value
        .replaceAll("(?im)(auto login as )[^\\r\\n]*", "$1[omitted]")
        .replaceAll("(?im)\\bbody:\\s*[^\\r\\n]*", "body: [omitted]")
        .replaceAll("(?i)(\"(?:password|encryptedAppTicket|token|sessionToken|access_token|refresh_token|authorization|cookie|x-session-token)\"\\s*:\\s*\")(?:[^\"\\\\]|\\\\[\\s\\S])*(?:\"|\\\\?$)", "$1[REDACTED]\"")
        .replaceAll("(?i)\\bBearer\\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]")
        .replaceAll("(?im)((?:authorization|cookie|x-session-token)\\s*:\\s*)[^\\r\\n]*", "$1[REDACTED]")
        .replaceAll("(?i)((?:password|token|sessionToken|access_token|refresh_token|secret)\\s*=\\s*)[^&\\s\"']+", "$1[REDACTED]")
        .replaceAll("(?i)(/connect/)[A-Za-z0-9_-]{16,}", "$1[REDACTED]")
        .replaceAll("\\beyJ[A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_-]*){0,2}", "[REDACTED-JWT]");
  }

  private static byte[] read(File file) throws IOException {
    if (!file.isFile() || file.length() > LIMIT) throw new IOException("Missing or oversized diagnostic file");
    try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192]; int count;
      while ((count = in.read(buffer)) != -1) {
        if (out.size() + count > LIMIT) throw new IOException("Diagnostic file grew beyond limit");
        out.write(buffer, 0, count);
      }
      return out.toByteArray();
    }
  }

  private static void entry(ZipOutputStream zip, String name, String text) throws IOException {
    zip.putNextEntry(new ZipEntry(name));
    zip.write(redact(text).getBytes("UTF-8"));
    zip.closeEntry();
  }

  public static void write(File external, File privateFiles, File output, String metadata, String logcat)
      throws Exception {
    PackInstaller.mkdir(output.getParentFile());
    File partial = new File(output.getPath() + ".part");
    try {
      try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(partial))) {
        entry(zip, "device.json", metadata);
        StringBuilder notes = new StringBuilder();
        for (String name : SNAPSHOTS) {
          try {
            if (external == null) throw new IOException("External storage unavailable");
            entry(zip, name, new String(read(new File(external, name)), "UTF-8"));
          }
          catch (IOException missing) { notes.append(name).append(": unavailable\n"); }
        }
        File directory = new File(privateFiles, "tesl-reborn-logs");
        for (String name : LOGS) {
          try { entry(zip, "logs/" + name, new String(read(new File(directory, name)), "UTF-8")); }
          catch (IOException missing) { notes.append(name).append(": unavailable\n"); }
        }
        // Optional own-UID Android logcat; private core logs work without it.
        entry(zip, "android-errors.log", logcat.length() > LIMIT ? logcat.substring(0, LIMIT) : logcat);
        entry(zip, "availability.txt", notes.toString());
      }
      PackInstaller.atomic(partial, output);
    } finally { partial.delete(); }
  }

  public static void nativeError(File privateFiles, Throwable error) {
    try {
      File directory = new File(privateFiles, "tesl-reborn-logs"); PackInstaller.mkdir(directory);
      File current = new File(directory, "native.log");
      if (current.length() > 64 * 1024) PackInstaller.atomic(current, new File(directory, "native-previous.log"));
      StringWriter stack = new StringWriter(); error.printStackTrace(new PrintWriter(stack));
      String text = redact(stack.toString());
      try (OutputStream out = new FileOutputStream(current, true)) {
        out.write((new Date() + " " + text.substring(0, Math.min(text.length(), 8192)) + "\n").getBytes("UTF-8"));
      }
    } catch (Exception ignored) {}
  }

  public static File reportFile(File directory, String name) throws FileNotFoundException {
    if (name == null || !name.matches("report-[a-f0-9]{32}\\.zip")) throw new FileNotFoundException("Unknown diagnostic report");
    File file = new File(directory, name);
    if (!file.isFile()) throw new FileNotFoundException("Report no longer available");
    try {
      if (!directory.getCanonicalFile().equals(file.getCanonicalFile().getParentFile()))
        throw new FileNotFoundException("Report escapes its directory");
    } catch (IOException error) { throw new FileNotFoundException("Report path unavailable"); }
    return file;
  }
}
