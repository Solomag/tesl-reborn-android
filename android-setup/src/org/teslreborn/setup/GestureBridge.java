package org.teslreborn.setup;

import android.app.Activity;
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

  /** Temporary diagnostic overlay. Drawable overlays never receive/consume touch. */
  public static void onResume(Activity activity) {
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
