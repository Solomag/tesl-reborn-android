package org.teslreborn.setup;

/** Android coordinates: top left, independently of Unity render resolution/insets. */
public final class CornerTaps {
  private float startX, startY;
  private long began, first;
  private int count;
  private boolean armed;

  public boolean touch(int action, int pointers, float x, float y, float zone, long now) {
    boolean inside = x >= 0 && y >= 0 && x <= zone && y <= zone;
    if (pointers != 1 || action == 3) {
      count = 0;
      armed = false;
      return false;
    }
    if (action == 0) {
      armed = inside;
      startX = x;
      startY = y;
      began = now;
      return false;
    }
    if (action != 1) return false;
    boolean valid =
        armed && inside && now - began <= 400 && Math.hypot(x - startX, y - startY) < zone * .35;
    armed = false;
    if (!valid) {
      count = 0;
      return false;
    }
    if (count == 0 || now - first > 1100) {
      count = 0;
      first = now;
    }
    return ++count == 3 && reset();
  }

  public int progress(long now) {
    return count > 0 && now - first <= 1100 ? count : 0;
  }

  private boolean reset() {
    count = 0;
    return true;
  }
}
