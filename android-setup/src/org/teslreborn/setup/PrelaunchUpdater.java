package org.teslreborn.setup;

import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;

/** Stages an API-1 pending core before Unity exists; the loader still owns trial/rollback. */
public final class PrelaunchUpdater {
  static final int LIMIT = 4 * 1024 * 1024;
  public interface Progress { void show(String phase); }
  public interface Transport { byte[] get(String url, int limit, Cancellation cancel) throws Exception; }
  public static final class Cancellation {
    private volatile boolean cancelled;
    private volatile HttpURLConnection connection;
    private final long deadline = System.nanoTime() + 12_000_000_000L;
    public synchronized void cancel() {
      cancelled = true;
      final HttpURLConnection c = connection;
      if (c != null) new Thread(() -> c.disconnect()).start();
    }
    public void check() throws IOException {
      if (cancelled || Thread.currentThread().isInterrupted() || System.nanoTime() > deadline)
        throw new IOException("Update check cancelled or timed out");
    }
  }
  public static final class Https implements Transport {
    public byte[] get(String value, int limit, Cancellation cancel) throws Exception {
      origin(value); cancel.check();
      HttpURLConnection c = (HttpURLConnection) new URL(value).openConnection();
      cancel.connection = c;
      c.setInstanceFollowRedirects(false); c.setConnectTimeout(4000); c.setReadTimeout(3000);
      c.setUseCaches(false); c.setRequestProperty("Accept-Encoding", "identity");
      c.setRequestProperty("Cache-Control", "no-cache");
      try {
        cancel.check();
        if (c.getResponseCode() != 200) throw new IOException("Update HTTP " + c.getResponseCode());
        if (c.getContentLengthLong() > limit) throw new IOException("Update exceeds size limit");
        try(InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
          byte[] b = new byte[16384]; int n;
          while ((n = in.read(b)) != -1) {
            cancel.check();
            if (out.size() + n > limit) throw new IOException("Update exceeds size limit");
            out.write(b, 0, n);
          }
          cancel.check(); return out.toByteArray();
        }
      } finally { cancel.connection = null; c.disconnect(); }
    }
  }
  static String origin(String value) throws Exception {
    if (value == null || value.length() > 2048 || !value.matches("https://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(?:/[^\\s?#\\\\]*)?"))
      throw new IOException("Invalid HTTPS update URL");
    URI u = new URI(value);
    if (u.getHost() == null || u.getUserInfo() != null || u.getRawQuery() != null || u.getRawFragment() != null)
      throw new IOException("Invalid HTTPS update URL");
    return "https://" + u.getHost().toLowerCase(Locale.ROOT) + ":" + (u.getPort() == -1 ? 443 : u.getPort());
  }
  static long integer(JSONObject o, String key) throws Exception {
    Object value = o.get(key);
    if (!(value instanceof Number)) throw new IOException("Invalid numeric manifest field");
    double d = ((Number)value).doubleValue(); long n = ((Number)value).longValue();
    if (!Double.isFinite(d) || d != n || n < 0 || n > 9007199254740991L)
      throw new IOException("Invalid numeric manifest field");
    return n;
  }
  public static JSONObject validate(JSONObject m) throws Exception {
    for(String key:new String[]{"format","abi","version","sha256"})
      if(!(m.get(key) instanceof String))throw new IOException("Invalid string manifest field");
    if (integer(m,"schema") != 1 || !"tesl-reborn-hook-v1".equals(m.getString("format"))
        || integer(m,"loaderApi") != 1 || integer(m,"gameVersionCode") != 11009
        || !"arm64-v8a".equals(m.getString("abi")) || integer(m,"revision") < 1
        || integer(m,"bytes") < 1 || integer(m,"bytes") > LIMIT
        || !m.getString("version").matches("[a-zA-Z0-9._+\\-]{1,80}")
        || !m.getString("sha256").matches("[a-f0-9]{64}")) throw new IOException("Incompatible update manifest");
    JSONObject clean = new JSONObject();
    for (String k : new String[]{"schema","format","loaderApi","gameVersionCode","abi","revision","version","bytes","sha256"}) clean.put(k,m.get(k));
    return clean;
  }
  static JSONObject read(File file, int limit) throws Exception {
    try(InputStream in = new FileInputStream(file)) {return new JSONObject(text(PackInstaller.read(in,limit)));}
  }
  static String text(byte[] bytes) throws Exception {
    return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
  }
  static long revision(JSONObject value) {
    try {return integer(validate(value),"revision");} catch(Exception bad) {return 0;}
  }
  private static JSONObject state(File root) {
    try {JSONObject s=read(new File(root,"state.json"),32768);
      if (integer(s,"schema")==1 && s.optJSONArray("rejected")!=null) return s;
    }catch(Exception ignored){}
    try {return new JSONObject().put("schema",1).put("active",JSONObject.NULL).put("previous",JSONObject.NULL)
      .put("pending",JSONObject.NULL).put("booting",JSONObject.NULL).put("rejected",new JSONArray());}
    catch(Exception impossible) {throw new IllegalStateException(impossible);}
  }
  public static String check(File privateFiles, JSONObject config, JSONObject embedded,
      Transport transport, Cancellation cancel, Progress progress) throws Exception {
    return check(privateFiles,config,embedded,transport,cancel,progress,()->true);
  }
  public static String check(File privateFiles, JSONObject config, JSONObject embedded,
      Transport transport, Cancellation cancel, Progress progress, java.util.function.BooleanSupplier mayStage) throws Exception {
    if (!config.optBoolean("enabled",true) || config.optBoolean("safeMode",false)) return "disabled";
    String feed=config.optString("feedUrl",""); if(feed.isEmpty())return "no-feed";
    String host=origin(feed);
    JSONObject base=validate(embedded);
    File root=new File(privateFiles,"tesl-reborn-updater"); PackInstaller.mkdir(root);
    JSONObject state=state(root);
    if(!state.isNull("booting"))return "recovery-first"; // Let API 1 reject the previous failed trial first.
    progress.show("Checking Reborn update…");
    JSONObject remote=readManifest(transport.get(feed,32768,cancel));
    JSONObject clean=validate(remote);
    long floor=Math.max(integer(base,"revision"),Math.max(revision(state.optJSONObject("active")),revision(state.optJSONObject("pending"))));
    if(integer(clean,"revision")<=floor)return "up-to-date";
    JSONArray rejected=state.getJSONArray("rejected");String hash=clean.getString("sha256");
    for(int i=0;i<rejected.length();i++)if(hash.equals(rejected.optString(i)))return "rejected";
    String url=remote.getString("url");if(!host.equals(origin(url)))throw new IOException("Update payload origin differs");
    progress.show("Downloading Reborn update…");
    byte[] code=transport.get(url,LIMIT,cancel);cancel.check();
    progress.show("Verifying Reborn update…");
    if(code.length!=integer(clean,"bytes") || !hash.equals(PackInstaller.hex(MessageDigest.getInstance("SHA-256").digest(code)))
        || !text(code).startsWith("// TESL-REBORN-ANDROID-CORE v1\n")) throw new IOException("Update checksum, size or format differs");
    File pending=new File(root,hash+".js."+UUID.randomUUID()+".part");
    try {
      try(FileOutputStream out=new FileOutputStream(pending)){out.write(code);out.getFD().sync();}
      synchronized(cancel) {
        cancel.check();
        if(!mayStage.getAsBoolean())return "game-already-running";
        PackInstaller.atomic(pending,new File(root,hash+".js"));
        state.put("pending",clean);PackInstaller.writeJson(new File(root,"state.json"),state);
      }
    }finally{pending.delete();}
    return "staged";
  }
  private static JSONObject readManifest(byte[] value) throws Exception {
    if(value.length>32768)throw new IOException("Update manifest exceeds size limit");
    return new JSONObject(text(value));
  }
}
