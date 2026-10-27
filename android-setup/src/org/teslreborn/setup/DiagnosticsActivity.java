package org.teslreborn.setup;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.*;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Separate from Unity, so reports can be shared even when the game is stuck. */
public final class DiagnosticsActivity extends Activity {
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private TextView status;
  private Button share;
  private String uiLanguage() {
    return getSharedPreferences(ResourceActivity.class.getName(), 0).getString("uiLanguage", "en_us");
  }
  private String tr(String text) { return UiStrings.text(uiLanguage(), text); }

  public static void installShortcut(Context context) {
    try {
      ShortcutManager manager = context.getSystemService(ShortcutManager.class);
      if (manager == null) return;
      Intent intent = new Intent(context, DiagnosticsActivity.class).setAction(Intent.ACTION_VIEW);
      ShortcutInfo shortcut = new ShortcutInfo.Builder(context, "tesl-diagnostics")
          .setShortLabel("Diagnostics").setLongLabel("TESL Reborn diagnostics")
          .setIcon(Icon.createWithResource(context, android.R.drawable.ic_menu_info_details))
          .setIntent(intent).build();
      manager.addDynamicShortcuts(Collections.singletonList(shortcut));
    } catch (Exception ignored) {}
  }

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout box = UiStyle.page(this);
    UiStyle.heading(this, box, tr("Diagnostics"));
    String version = "TESL Reborn · APK 50";
    try {
      JSONObject current = PackInstaller.json(new File(getExternalFilesDir(null), "tesl-reborn-update-status.json")).optJSONObject("current");
      if (current != null) version += "\nPatch " + current.optInt("revision") + " · " + current.optString("version");
    } catch (Exception ignored) {}
    status = UiStyle.body(this, box, version + "\n\n" + tr("Share logs and version details."));
    status.setTextIsSelectable(true);
    share = new Button(this); share.setText(tr("Share diagnostic report"));
    UiStyle.button(this, share, true); box.addView(share);
    share.setOnClickListener(view -> export());
  }

  private String androidErrors() {
    ExecutorService reader = Executors.newSingleThreadExecutor(); java.lang.Process process = null;
    try {
      process = new ProcessBuilder("logcat", "-d", "-t", "1500", "-v", "threadtime",
          "tesl-hook:I", "Unity:W", "AndroidRuntime:E", "DEBUG:E", "*:S").redirectErrorStream(true).start();
      final InputStream input = process.getInputStream();
      Future<String> result = reader.submit(() -> {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while (out.size() < 256 * 1024 && (count = input.read(buffer, 0, Math.min(buffer.length, 256 * 1024 - out.size()))) != -1)
          out.write(buffer, 0, count);
        return new String(out.toByteArray(), "UTF-8");
      });
      return result.get(5, TimeUnit.SECONDS);
    } catch (Exception unavailable) { return "Android logcat unavailable. Private rolling logs are included instead."; }
    finally { if (process != null) process.destroy(); reader.shutdownNow(); }
  }

  private void export() {
    share.setEnabled(false); status.setText(tr("Preparing diagnostic report…"));
    worker.execute(() -> {
      try {
        File directory = new File(getCacheDir(), "diagnostic-reports"); PackInstaller.mkdir(directory);
        File output = new File(directory, "report-" + UUID.randomUUID().toString().replace("-", "") + ".zip");
        JSONObject device = new JSONObject().put("androidBuild",50).put("sdk",Build.VERSION.SDK_INT)
            .put("model",Build.MODEL).put("at",System.currentTimeMillis());
        try {
        ActivityManager manager = (ActivityManager)getSystemService(ACTIVITY_SERVICE);
        java.util.List<ActivityManager.RunningAppProcessInfo> processes = manager.getRunningAppProcesses();
        if (processes != null) for (ActivityManager.RunningAppProcessInfo info : processes) {
          if (info.uid == android.os.Process.myUid() && info.processName.equals(getPackageName())) {
            android.os.Debug.MemoryInfo[] memory = manager.getProcessMemoryInfo(new int[]{info.pid});
            if (memory.length > 0) device.put("gamePssKb",memory[0].getTotalPss());
          }
        }
        } catch (Exception ignored) { device.put("memoryUnavailable",true); }
        DiagnosticsArchive.write(getExternalFilesDir(null),getFilesDir(),output,device.toString(),androidErrors());
        File[] previous = directory.listFiles((dir,name) -> name.matches("report-[a-f0-9]{32}\\.zip"));
        if (previous != null) {
          Arrays.sort(previous, (a,b) -> Long.compare(b.lastModified(),a.lastModified()));
          for (int i = 3; i < previous.length; i++) if (!previous[i].equals(output)) previous[i].delete();
        }
        Uri uri = new Uri.Builder().scheme("content").authority(getPackageName()+".tesl-reborn-diagnostics").appendPath(output.getName()).build();
        runOnUiThread(() -> {
          if (isDestroyed()) return;
          share.setEnabled(true); status.setText(tr("Report ready. Choose where to share it."));
          Intent intent = new Intent(Intent.ACTION_SEND).setType("application/zip")
              .putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          intent.setClipData(ClipData.newRawUri("TESL Reborn diagnostics",uri));
          try { startActivity(Intent.createChooser(intent,tr("Share diagnostic report"))); }
          catch (Exception error) { status.setText(tr("Could not share report.")+"\n"+error.getClass().getSimpleName()); }
        });
      } catch (Exception error) {
        DiagnosticsArchive.nativeError(getFilesDir(),error);
        runOnUiThread(() -> { if (!isDestroyed()) { share.setEnabled(true); status.setText(tr("Could not prepare report.")+"\n"+error.getClass().getSimpleName()); }});
      }
    });
  }
  @Override public void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
}
