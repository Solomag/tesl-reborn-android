package org.teslreborn.setup;

import android.app.ActivityManager;
import android.content.Context;
import java.util.ArrayList;
import java.util.List;

/** The game's own process (same package and uid, not this activity's process). */
public final class GameProcess {
  private GameProcess() {}

  /** True when it runs, or when ownership cannot be established: never write state then. */
  public static boolean running(Context context) {
    try {
      List<ActivityManager.RunningAppProcessInfo> processes = manager(context).getRunningAppProcesses();
      if (processes == null) return true;
      for (ActivityManager.RunningAppProcessInfo process : processes)
        if (process.uid == android.os.Process.myUid() && context.getPackageName().equals(process.processName)
            && process.pid != android.os.Process.myPid()) return true;
      return false;
    } catch (Exception unknown) { return true; }
  }

  /** Kills the game process and waits until it is gone; call on a worker thread. */
  public static void stop(Context context) throws Exception {
    List<ActivityManager.RunningAppProcessInfo> processes = manager(context).getRunningAppProcesses();
    List<Integer> stopped = new ArrayList<>();
    if (processes != null)
      for (ActivityManager.RunningAppProcessInfo process : processes)
        if (context.getPackageName().equals(process.processName)
            && process.uid == android.os.Process.myUid()
            && process.pid != android.os.Process.myPid()) {
          stopped.add(process.pid);
          android.os.Process.killProcess(process.pid);
        }
    int[] pids = new int[stopped.size()];
    for (int i = 0; i < pids.length; i++) pids[i] = stopped.get(i);
    RestartWaiter.await(pids, 5000, pid -> {
      try { android.system.Os.kill(pid, 0); return true; }
      catch (android.system.ErrnoException e) {
        if (e.errno == android.system.OsConstants.ESRCH) return false;
        throw e;
      }
    }, Thread::sleep, android.os.SystemClock::elapsedRealtime);
  }

  private static ActivityManager manager(Context context) {
    return (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
  }
}
