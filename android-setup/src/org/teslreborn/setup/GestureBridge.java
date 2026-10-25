package org.teslreborn.setup;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import java.io.File;
import org.json.JSONObject;

/** Feeds the original Unity activity real Android keyboard events. No permission changes. */
public final class GestureBridge {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final CornerTaps TAPS = new CornerTaps();
  private static long lastChord;

  public static void onTouch(Activity activity, MotionEvent event) {
    try {
      View view = activity.getWindow().getDecorView();
      float zone =
          Math.max(
              48 * view.getResources().getDisplayMetrics().density,
              Math.min(view.getWidth(), view.getHeight()) * .1f);
      if (TAPS.touch(
              event.getActionMasked(),
              event.getPointerCount(),
              event.getX(),
              event.getY(),
              zone,
              SystemClock.uptimeMillis())
          && SystemClock.uptimeMillis() - lastChord > 500) {
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
