package org.teslreborn.setup;

import android.app.Activity;
import android.app.ActivityManager;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.*;
import java.util.List;
import java.util.concurrent.*;
import android.content.Intent;
import android.os.Bundle;
import java.io.File;
import java.io.InputStream;
import org.json.JSONObject;

/** Checks an update before a cold Unity start; never opens the resource form for a ready game. */
public final class LaunchActivity extends Activity {
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final PrelaunchUpdater.Cancellation cancel = new PrelaunchUpdater.Cancellation();
  private Intent destination;
  private boolean launched;
  private File external;
  private TextView progress;

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
        if (!gameRunning()) { checkUpdate(root,setup); return; }
      }
    } catch (Exception ignored) {
      /* Missing/unverified data opens the installer. */
    }
    destination = target;
    startGame("skipped");
  }

  private boolean gameRunning() {
    try {
      ActivityManager manager = (ActivityManager)getSystemService(ACTIVITY_SERVICE);
      List<ActivityManager.RunningAppProcessInfo> processes = manager.getRunningAppProcesses();
      if(processes == null)return true; // Never write state when process ownership is uncertain.
      for(ActivityManager.RunningAppProcessInfo process : processes)
        if(process.uid == android.os.Process.myUid() && getPackageName().equals(process.processName))return true;
      return false;
    }catch(Exception unknown){return true;}
  }

  private void record(String status) {
    if(external == null)return;
    try {PackInstaller.writeJson(new File(external,"tesl-reborn-prelaunch-status.json"),
      new JSONObject().put("status",status).put("checkedAt",System.currentTimeMillis()));}catch(Exception ignored){}
  }

  private void checkUpdate(File root, JSONObject setup) {
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);
    box.setBackgroundColor(Color.BLACK);box.setPadding(24,24,24,24);
    TextView title=new TextView(this);title.setText("TESL Reborn");title.setTextColor(0xffffe8ad);title.setTextSize(26);
    box.addView(title);progress=new TextView(this);progress.setTextColor(Color.WHITE);progress.setTextSize(18);
    progress.setText(tr("Checking Reborn update…"));box.addView(progress);
    Button skip=new Button(this);skip.setText(tr("Play now"));skip.setOnClickListener(v->startGame("skipped"));box.addView(skip);
    setContentView(box);
    handler.postDelayed(()->startGame("timeout"),12000);
    worker.execute(()->{
      String result;
      try {
        JSONObject config=UpdateConfig.ensure(root,setup.optString("hookFeed",""));
        result=PrelaunchUpdater.check(getFilesDir(),config,setup.getJSONObject("hookRelease"),
          new PrelaunchUpdater.Https(),cancel,phase->runOnUiThread(()->{if(!launched)progress.setText(tr(phase));}),()->!gameRunning());
      }catch(Exception error){result="unavailable";DiagnosticsArchive.nativeError(getFilesDir(),error);}
      final String status=result;
      runOnUiThread(()->{if(!launched)startGame(status);});
    });
  }
  private String tr(String key) {return UiStrings.text(ResourceActivity.systemLanguageCode(),key);}

  private void startGame(String status) {
    if(launched || isDestroyed())return;
    cancel.cancel();launched=true;handler.removeCallbacksAndMessages(null);record(status);
    destination.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
    startActivity(destination);finish();
  }
  @Override public void onBackPressed(){startGame("skipped");}
  @Override public void onDestroy(){cancel.cancel();handler.removeCallbacksAndMessages(null);worker.shutdownNow();super.onDestroy();}
}
