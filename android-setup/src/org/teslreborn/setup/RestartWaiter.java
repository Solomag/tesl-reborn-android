package org.teslreborn.setup;

import java.io.IOException;

/** Wait on a worker thread; never relaunch into a process whose termination is pending. */
public final class RestartWaiter {
  public interface Running { boolean test(int pid) throws Exception; }
  public interface Pause { void sleep(long milliseconds) throws Exception; }
  public interface Clock { long now(); }

  public static void await(int[] pids, long timeout, Running running, Pause pause, Clock clock)
      throws Exception {
    long deadline = clock.now() + timeout;
    while (true) {
      boolean alive = false;
      for (int pid : pids) alive |= running.test(pid);
      if (!alive) return;
      if (clock.now() >= deadline) throw new IOException("The previous game process has not stopped. Retry launching the game.");
      pause.sleep(50);
    }
  }
}
