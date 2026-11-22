package org.teslreborn.setup;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.Surface;
import android.view.SurfaceView;
import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reports 143-144 (Xiaomi, Android 14): the picture froze with the music
 * playing and the game on screen. Unity 2017's Java thread (UnityPlayer$e)
 * draws only while two of its flags are set: b (running, set after a resume)
 * and c (a surface, set once the surface reached Unity). With either clear it
 * sleeps until another message comes. While the activity is resumed this
 * looks once a second; the same thing missing on two looks in a row is set
 * back from what Android says: the surface the SurfaceView has, the window
 * focus the window has, the resume Unity missed, or the loop's own running
 * flag. The hook (hook/07-unity-player-loop.ts) does the same over JNI after
 * 4 s without a frame, for APKs without this class. What was done goes to
 * tesl-reborn-loop-status.json (in the diagnostics archive).
 */
final class UnityLoopWatch {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final long TICK = 1000, QUIET = 10_000;
  private static int generation;
  private static String last = "";
  private static long revivedAt;
  private static boolean broken;

  private UnityLoopWatch() {}

  static void start(Activity activity) {
    if (broken) return;
    final int run = ++generation;
    last = "";
    MAIN.postDelayed(
        new Runnable() {
          @Override
          public void run() {
            if (run != generation || broken || activity.isFinishing()) return;
            look(activity);
            MAIN.postDelayed(this, TICK);
          }
        },
        TICK);
  }

  static void stop() {
    generation++;
    last = "";
  }

  /** The same order as unityLoopPlan in hook/07-unity-player-loop.ts. */
  static String plan(boolean loopRunning, boolean loopSurface, boolean unityRunning, boolean unityPaused,
      boolean unityFocus, boolean windowFocus, boolean surfaceValid, boolean finishing) {
    if (unityPaused || finishing) return "";
    StringBuilder plan = new StringBuilder();
    if (!loopSurface && surfaceValid) plan.append("surface ");
    if (!loopRunning) {
      if (!unityFocus && windowFocus) plan.append("focus ");
      // Without window focus Unity rightly waits for it (a dialog, the
      // notification shade); unlike the hook, nothing is sent then.
      if (unityRunning) plan.append("loop");
      else if (windowFocus) plan.append("resume");
    }
    return plan.toString().trim();
  }

  private static Field field(Class<?> type, String name) throws NoSuchFieldException {
    for (Class<?> at = type; at != null; at = at.getSuperclass()) {
      try {
        Field found = at.getDeclaredField(name);
        found.setAccessible(true);
        return found;
      } catch (NoSuchFieldException next) {
        // Look in the superclass.
      }
    }
    throw new NoSuchFieldException(name);
  }

  private static Object get(Object owner, String name) throws Exception {
    return field(owner.getClass(), name).get(owner);
  }

  private static Method method(Object owner, String name, Class<?>... types) throws Exception {
    Method found = owner.getClass().getDeclaredMethod(name, types);
    found.setAccessible(true);
    return found;
  }

  private static void look(Activity activity) {
    try {
      Object player = get(activity, "mUnityPlayer");
      if (player == null) return;
      Object thread = get(player, "a"), state = get(player, "f");
      SurfaceView view = (SurfaceView) get(player, "q");
      if (thread == null || state == null) return;
      Surface surface = view == null ? null : view.getHolder().getSurface();
      boolean loopRunning = (Boolean) get(thread, "b"), loopSurface = (Boolean) get(thread, "c");
      boolean unityRunning = (Boolean) get(state, "d"), unityPaused = (Boolean) get(state, "e");
      boolean unityFocus = (Boolean) get(state, "c"), windowFocus = activity.hasWindowFocus();
      boolean surfaceValid = surface != null && surface.isValid();
      String plan = plan(loopRunning, loopSurface, unityRunning, unityPaused, unityFocus, windowFocus,
          surfaceValid, activity.isFinishing());
      // Missing on one look is a resume in progress; on two, Unity waits.
      boolean stuck = !plan.isEmpty() && plan.equals(last);
      last = plan;
      if (!stuck || System.currentTimeMillis() - revivedAt < QUIET) return;
      revivedAt = System.currentTimeMillis();
      last = "";
      StringBuilder done = new StringBuilder();
      for (String step : plan.split(" ")) {
        if (step.equals("surface")) {
          method(player, "b", int.class, Surface.class).invoke(player, 0, surface);
        } else if (step.equals("focus")) {
          method(player, "windowFocusChanged", boolean.class).invoke(player, true);
        } else if (step.equals("resume")) {
          // The focus above may have resumed Unity already.
          if ((Boolean) get(state, "d")) continue;
          method(player, "f").invoke(player);
        } else if (step.equals("loop")) {
          method(thread, "b").invoke(thread);
        }
        done.append(done.length() == 0 ? "" : " ").append(step);
      }
      note(activity, new JSONObject().put("at", revivedAt).put("done", done.toString())
          .put("state", "loop running " + loopRunning + ", surface " + loopSurface + "; unity running "
              + unityRunning + ", focus " + unityFocus + "; window focus " + windowFocus
              + ", surface valid " + surfaceValid));
    } catch (Throwable error) {
      // Another game build: the hook's own watch is left to it.
      broken = true;
      try {
        note(activity, new JSONObject().put("at", System.currentTimeMillis()).put("error", error.toString()));
      } catch (Exception ignored) {
      }
    }
  }

  private static void note(Activity activity, JSONObject event) throws Exception {
    File root = activity.getExternalFilesDir(null);
    if (root == null) return;
    File file = new File(root, "tesl-reborn-loop-status.json");
    JSONArray events;
    try {
      events = PackInstaller.json(file).optJSONArray("events");
    } catch (Exception missing) {
      events = null;
    }
    JSONArray kept = new JSONArray();
    if (events != null) for (int i = Math.max(0, events.length() - 9); i < events.length(); i++) kept.put(events.get(i));
    kept.put(event);
    PackInstaller.writeJson(file, new JSONObject().put("schema", 1).put("events", kept));
  }
}
