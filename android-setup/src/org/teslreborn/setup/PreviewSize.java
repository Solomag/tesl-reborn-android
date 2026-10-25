package org.teslreborn.setup;

/** Fit the rotated camera buffer without stretching; pure Java for JVM tests. */
public final class PreviewSize {
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
