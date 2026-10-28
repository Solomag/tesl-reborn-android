package org.teslreborn.setup;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import java.io.File;
import java.util.WeakHashMap;
import org.json.JSONObject;

/** Feeds the original Unity activity real Android keyboard events. No permission changes. */
public final class GestureBridge {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final CornerTaps TAPS = new CornerTaps();
  private static long lastChord;
  private static final WeakHashMap<Activity, Marker> MARKERS = new WeakHashMap<>();

  /** Extra for LaunchActivity: stop the game and start it again. */
  static final String RESTART_EXTRA = "org.teslreborn.restart";
  private static boolean leftWhileLoading;

  /**
   * Leaving the game during its first load breaks the load: it never gets
   * past the loading screen after coming back. The hook writes
   * tesl-reborn-loading.json with its process id: loaded false at start, true
   * once the login form or the main menu is reached. Left while it says false
   * for this process (within three minutes of the start), the game is restarted on return. Without the file (an
   * older patch) nothing changes.
   */
  public static void onPause(Activity activity) {
    try {
      JSONObject state = PackInstaller.json(new File(activity.getExternalFilesDir(null), "tesl-reborn-loading.json"));
      // A load takes well under three minutes; an older "still loading" is
      // a hook that stopped updating the file, not a load.
      leftWhileLoading = state.optInt("pid", -1) == android.os.Process.myPid() && !state.optBoolean("loaded", true)
          && Math.abs(System.currentTimeMillis() - state.optLong("at", 0)) < 3 * 60 * 1000L;
    } catch (Exception missing) {
      leftWhileLoading = false;
    }
  }

  /** Temporary diagnostic overlay. Drawable overlays never receive/consume touch. */
  public static void onResume(Activity activity) {
    if (leftWhileLoading) {
      leftWhileLoading = false;
      try {
        Intent restart = new Intent(activity, LaunchActivity.class).putExtra(RESTART_EXTRA, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity.startActivity(restart);
        return;
      } catch (Exception error) {
        status(activity, "restart-error: " + error.getClass().getSimpleName());
      }
    }
    requestRefreshRate(activity);
    View view = activity.getWindow().getDecorView();
    view.post(
        () -> {
          try {
            boolean visible = false;
            try {
              visible =
                  PackInstaller.json(
                          new File(
                              activity.getExternalFilesDir(null), "tesl-reborn-debug-marker.json"))
                      .optBoolean("enabled", false);
            } catch (Exception ignored) {
            }
            Marker old = MARKERS.get(activity);
            if (!visible) {
              if (old != null) {
                view.getOverlay().remove(old);
                view.removeOnLayoutChangeListener(old);
                MARKERS.remove(activity);
              }
              return;
            }
            if (old != null) {
              size(view, old);
              return;
            }
            Marker marker = new Marker(view.getResources().getDisplayMetrics().density);
            MARKERS.put(activity, marker);
            size(view, marker);
            view.getOverlay().add(marker);
            view.addOnLayoutChangeListener(marker);
            status(activity, "marker-ready");
          } catch (Exception error) {
            status(activity, "marker-error: " + error.getClass().getSimpleName());
          }
        });
  }

  /**
   * Unity 2017 never asks Android for a display rate, so phones keep old games
   * at 60 Hz and a 90/120 FPS target cannot be reached. With a frame rate chosen
   * in Game data, ask for the display mode of the same resolution whose
   * refresh rate is the lowest one at or above it (the highest if none is).
   */
  static void requestRefreshRate(Activity activity) {
    try {
      int wanted =
          PackInstaller.json(new File(activity.getExternalFilesDir(null), "tesl-reborn-graphics.json"))
              .optInt("frameRate", 0);
      if (wanted <= 0) return;
      android.view.Display display = activity.getWindowManager().getDefaultDisplay();
      android.view.Display.Mode current = display.getMode(), chosen = null;
      for (android.view.Display.Mode mode : display.getSupportedModes()) {
        if (mode.getPhysicalWidth() != current.getPhysicalWidth()
            || mode.getPhysicalHeight() != current.getPhysicalHeight()) continue;
        float rate = mode.getRefreshRate();
        if (chosen == null) chosen = mode;
        else if (chosen.getRefreshRate() < wanted - 0.5f
            ? rate > chosen.getRefreshRate()
            : rate >= wanted - 0.5f && rate < chosen.getRefreshRate()) chosen = mode;
      }
      if (chosen == null) return;
      android.view.WindowManager.LayoutParams params = activity.getWindow().getAttributes();
      if (params.preferredDisplayModeId != chosen.getModeId()) {
        params.preferredDisplayModeId = chosen.getModeId();
        activity.getWindow().setAttributes(params);
      }
      refreshStatus(activity, new JSONObject().put("wanted", wanted)
          .put("chosenHz", chosen.getRefreshRate()).put("currentHz", current.getRefreshRate())
          .put("modes", display.getSupportedModes().length));
    } catch (Exception error) {
      try { refreshStatus(activity, new JSONObject().put("error", error.toString())); } catch (Exception ignored) {}
    }
  }

  private static void refreshStatus(Activity activity, JSONObject state) throws Exception {
    File root = activity.getExternalFilesDir(null);
    if (root != null) PackInstaller.writeJson(new File(root, "tesl-reborn-refresh-status.json"), state);
  }

  private static float zone(View view) {
    return Math.max(
        48 * view.getResources().getDisplayMetrics().density,
        Math.min(view.getWidth(), view.getHeight()) * .1f);
  }

  private static void size(View view, Marker marker) {
    int size = Math.round(zone(view));
    marker.setBounds(0, 0, size, size);
    marker.invalidateSelf();
  }

  private static final class Marker extends Drawable implements View.OnLayoutChangeListener {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float density;
    private int taps;
    private long seen;

    Marker(float density) {
      this.density = density;
    }

    void feedback(int count) {
      taps = count;
      seen = count > 0 ? SystemClock.uptimeMillis() : 0;
      invalidateSelf();
      // Expire feedback even without another touch.
      MAIN.postDelayed(() -> invalidateSelf(), 1300);
    }

    @Override
    public void onLayoutChange(
        View v, int l, int t, int r, int b, int ol, int ot, int or_, int ob) {
      size(v, this);
    }

    @Override
    public void draw(Canvas canvas) {
      boolean recent = SystemClock.uptimeMillis() - seen < 1250;
      paint.setStyle(Paint.Style.FILL);
      paint.setColor(recent && taps == 3 ? 0x8035d672 : 0x505b1b7d);
      canvas.drawRect(getBounds(), paint);
      paint.setStyle(Paint.Style.STROKE);
      paint.setStrokeWidth(2 * density);
      paint.setColor(recent ? 0xff64ff9b : 0xffff71dc);
      canvas.drawRect(1, 1, getBounds().right - 1, getBounds().bottom - 1, paint);
      paint.setStyle(Paint.Style.FILL);
      paint.setTextSize(12 * density);
      paint.setTextAlign(Paint.Align.CENTER);
      canvas.drawText(
          recent ? taps + "/3" : "3x",
          getBounds().width() / 2f,
          getBounds().height() / 2f + 4 * density,
          paint);
    }

    @Override
    public void setAlpha(int alpha) {}

    @Override
    public void setColorFilter(ColorFilter filter) {}

    @Override
    public int getOpacity() {
      return PixelFormat.TRANSLUCENT;
    }
  }

  public static void onTouch(Activity activity, MotionEvent event) {
    try {
      View view = activity.getWindow().getDecorView();
      float zone = zone(view);
      boolean complete =
          TAPS.touch(
              event.getActionMasked(),
              event.getPointerCount(),
              event.getX(),
              event.getY(),
              zone,
              SystemClock.uptimeMillis());
      if (event.getActionMasked() == MotionEvent.ACTION_UP) {
        SoftInputStyle.afterTap(activity);
        Marker marker = MARKERS.get(activity);
        if (marker != null)
          marker.feedback(complete ? 3 : TAPS.progress(SystemClock.uptimeMillis()));
      }
      if (complete && SystemClock.uptimeMillis() - lastChord > 500) {
        lastChord = SystemClock.uptimeMillis();
        status(activity, "gesture-detected");
        final long down = SystemClock.uptimeMillis();
        int ctrl = KeyEvent.META_CTRL_ON | KeyEvent.META_CTRL_LEFT_ON;
        send(activity, down, 0, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_CTRL_LEFT, ctrl);
        send(activity, down, 30, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_D, ctrl);
        send(activity, down, 130, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_D, ctrl);
        send(activity, down, 160, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_CTRL_LEFT, 0);
      }
    } catch (Exception error) {
      status(activity, "input-error: " + error.getClass().getSimpleName());
    }
  }

  private static void send(
      Activity activity, long down, long delay, int action, int code, int meta) {
    MAIN.postDelayed(
        () -> {
          if (activity.isFinishing() || activity.isDestroyed()) return;
          try {
            KeyEvent event =
                new KeyEvent(
                    down,
                    SystemClock.uptimeMillis(),
                    action,
                    code,
                    0,
                    meta,
                    -1,
                    0,
                    0,
                    InputDevice.SOURCE_KEYBOARD);
            activity.dispatchKeyEvent(event);
            if (action == KeyEvent.ACTION_UP && code == KeyEvent.KEYCODE_CTRL_LEFT)
              status(activity, "android-ctrl-d-sent");
          } catch (Exception error) {
            status(activity, "key-error: " + error.getClass().getSimpleName());
          }
        },
        delay);
  }

  private static void status(Activity activity, String state) {
    try {
      File root = activity.getExternalFilesDir(null);
      if (root != null)
        PackInstaller.writeJson(
            new File(root, "tesl-reborn-debug-status.json"),
            new JSONObject().put("status", state).put("backend", "android-key-events"));
    } catch (Exception ignored) {
    }
  }
}
