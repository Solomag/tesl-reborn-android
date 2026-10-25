package org.teslreborn.setup;

/** Fit the rotated camera buffer without stretching; pure Java for JVM tests. */
public final class PreviewSize {
  /** Map the TextureView's stretched corners to a uniformly rotated center crop. */
  public static float[] corners(int vw, int vh, int bw, int bh, int rotation) {
    if (vw < 1 || vh < 1 || bw < 1 || bh < 1 || rotation % 90 != 0)
      throw new IllegalArgumentException("Invalid preview geometry");
    rotation = (rotation % 360 + 360) % 360;
    int rw = rotation % 180 == 0 ? bw : bh, rh = rotation % 180 == 0 ? bh : bw;
    float scale = Math.max((float) vw / rw, (float) vh / rh);
    float dx = (vw - rw * scale) / 2, dy = (vh - rh * scale) / 2;
    float[] points = {0, 0, bw, 0, 0, bh};
    for (int i = 0; i < points.length; i += 2) {
      float x = points[i], y = points[i + 1], rx, ry;
      if (rotation == 90) {
        rx = bh - y;
        ry = x;
      } else if (rotation == 180) {
        rx = bw - x;
        ry = bh - y;
      } else if (rotation == 270) {
        rx = y;
        ry = bw - x;
      } else {
        rx = x;
        ry = y;
      }
      points[i] = dx + rx * scale;
      points[i + 1] = dy + ry * scale;
    }
    return points;
  }

  public static int[] fit(
      int viewWidth, int viewHeight, int bufferWidth, int bufferHeight, int rotation) {
    if (viewWidth < 1 || viewHeight < 1 || bufferWidth < 1 || bufferHeight < 1)
      throw new IllegalArgumentException("Invalid preview size");
    if (rotation % 180 != 0) {
      int swap = bufferWidth;
      bufferWidth = bufferHeight;
      bufferHeight = swap;
    }
    double scale = Math.min((double) viewWidth / bufferWidth, (double) viewHeight / bufferHeight);
    return new int[] {
      Math.max(1, (int) Math.round(bufferWidth * scale)),
      Math.max(1, (int) Math.round(bufferHeight * scale))
    };
  }
}
