package org.teslreborn.setup;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.*;
import java.util.concurrent.*;
import android.content.Intent;
import android.os.Bundle;
import java.io.File;
import java.io.InputStream;
import org.json.JSONObject;

/** Checks an update before a cold Unity start; never opens the resource form for a ready game. */
public final class LaunchActivity extends Activity {
  /** A running game is asked about an update at most this often. */
  static final long RUNNING_CHECK_INTERVAL = 10 * 60 * 1000L;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private PrelaunchUpdater.Cancellation cancel = new PrelaunchUpdater.Cancellation();
  private Intent destination;
  private boolean launched;
  private File external;
  private TextView progress;
  private LinearLayout box;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    DiagnosticsActivity.installShortcut(this);
    Intent target = new Intent(this, ResourceActivity.class);
    try {
      JSONObject setup;
      try (InputStream in = getAssets().open("tesl-reborn/setup.json")) {
        setup = new JSONObject(new String(PackInstaller.read(in, 256 * 1024), "UTF-8"));
      }
      File root = getExternalFilesDir(null);
      external = root;
      if (root == null) throw new java.io.IOException("App storage is unavailable");
      PackInstaller.writeJson(
          new File(root, "tesl-reborn-setup.json"),
          new JSONObject().put("api", 1).put("debugInput", "android-key-events")
              .put("androidBuild", setup.optInt("androidBuild", 50)).put("languageTransition", true));
      UpdateConfig.ensure(root, setup.optString("hookFeed", ""));
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
        destination = target;
        if (!GameProcess.running(this)) { checkUpdate(root,setup); return; }
        // A game kept in memory never reaches the cold-start check: ask the
        // feed, and offer a restart instead of silently resuming an old core.
        if (recentlyChecked()) { startGame("running"); return; }
        offerRestart(root,setup); return;
      }
    } catch (Exception ignored) {
      /* Missing/unverified data opens the installer. */
    }
    destination = target;
    startGame("skipped");
  }

  private boolean recentlyChecked() {
    try {
      long at = PackInstaller.json(new File(external,"tesl-reborn-prelaunch-status.json")).getLong("checkedAt");
      long age = System.currentTimeMillis() - at;
      return age >= 0 && age < RUNNING_CHECK_INTERVAL;
    } catch (Exception none) { return false; }
  }

  private void record(String status) {
    if(external == null)return;
    try {PackInstaller.writeJson(new File(external,"tesl-reborn-prelaunch-status.json"),
      new JSONObject().put("status",status).put("checkedAt",System.currentTimeMillis()));}catch(Exception ignored){}
  }

  private void screen(String message) {
    box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);
    box.setBackgroundColor(Color.BLACK);box.setPadding(24,24,24,24);
    TextView title=new TextView(this);title.setText("TESL Reborn");title.setTextColor(0xffffe8ad);title.setTextSize(26);
    box.addView(title);progress=new TextView(this);progress.setTextColor(Color.WHITE);progress.setTextSize(18);
    progress.setGravity(Gravity.CENTER);progress.setText(tr(message));box.addView(progress);
    setContentView(box);
  }

  private Button button(String label, Runnable action) {
    Button value=new Button(this);value.setText(tr(label));value.setOnClickListener(v->action.run());box.addView(value);
    return value;
  }

  private void checkUpdate(File root, JSONObject setup) {
    screen("Checking Reborn update…");
    button("Play now",()->startGame("skipped"));
    handler.postDelayed(()->startGame("timeout"),12000);
    stage(root,setup);
  }

  private void stage(File root, JSONObject setup) {
    worker.execute(()->{
      String result;
      try {
        JSONObject config=UpdateConfig.ensure(root,setup.optString("hookFeed",""));
        result=PrelaunchUpdater.check(getFilesDir(),config,setup.getJSONObject("hookRelease"),
          new PrelaunchUpdater.Https(),cancel,phase->runOnUiThread(()->{if(!launched)progress.setText(tr(phase));}),
          ()->!GameProcess.running(this));
      }catch(Exception error){result="unavailable";DiagnosticsArchive.nativeError(getFilesDir(),error);}
      final String status=result;
      runOnUiThread(()->{if(!launched)startGame(status);});
    });
  }

  /** The game is running: only the manifest is read; staging waits for a restart the player chose. */
  private void offerRestart(File root, JSONObject setup) {
    screen("Checking Reborn update…");
    button("Back to the game",()->startGame("running"));
    handler.postDelayed(()->startGame("running-timeout"),8000);
    worker.execute(()->{
      PrelaunchUpdater.Offer offer;
      try {
        JSONObject config=UpdateConfig.ensure(root,setup.optString("hookFeed",""));
        offer=PrelaunchUpdater.offer(getFilesDir(),config,setup.getJSONObject("hookRelease"),new PrelaunchUpdater.Https(),cancel);
      }catch(Exception error){DiagnosticsArchive.nativeError(getFilesDir(),error);runOnUiThread(()->{if(!launched)startGame("running-unavailable");});return;}
      final PrelaunchUpdater.Offer found=offer;
      runOnUiThread(()->{
        if(launched)return;
        if(!found.newer()){startGame("running-"+found.status);return;}
        handler.removeCallbacksAndMessages(null);
        screen("");
        // Matches live on the server: the restarted game rejoins one in
        // progress (api/match/rejoin at startup), so nothing is lost.
        progress.setText(String.format(tr("Reborn update %d is available. Restart the game to apply it."),
          found.manifest.optLong("revision")));
        button("Restart now",()->restart(root,setup));
        button("Back to the game",()->startGame("running-declined"));
      });
    });
  }

  private void restart(File root, JSONObject setup) {
    screen("Restarting the game…");
    // The first check's deadline has run while the player decided.
    cancel=new PrelaunchUpdater.Cancellation();
    handler.postDelayed(()->startGame("timeout"),20000);
    worker.execute(()->{
      try {GameProcess.stop(this);}
      catch(Exception error){
        DiagnosticsArchive.nativeError(getFilesDir(),error);
        runOnUiThread(()->{if(!launched)startGame("restart-failed");});
        return;
      }
      runOnUiThread(()->{if(!launched)progress.setText(tr("Checking Reborn update…"));});
      stage(root,setup);
    });
  }

  // Keep the prelaunch update screen in English regardless of device/game locale.
  private String tr(String key) {return key;}

  private void startGame(String status) {
    if(launched || isDestroyed())return;
    cancel.cancel();launched=true;handler.removeCallbacksAndMessages(null);record(status);
    destination.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
    startActivity(destination);finish();
  }
  @Override public void onBackPressed(){startGame("skipped");}
  @Override public void onDestroy(){cancel.cancel();handler.removeCallbacksAndMessages(null);worker.shutdownNow();super.onDestroy();}
}
