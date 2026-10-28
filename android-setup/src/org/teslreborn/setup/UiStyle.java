package org.teslreborn.setup;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import org.json.JSONObject;

/** The look of the game's own windows for the setup and diagnostics screens. */
public final class UiStyle {
  static final int BACKGROUND = 0xff171b22, PANEL = 0xff222832, GOLD = 0xffd7ae63,
      GOLD_LIGHT = 0xffffe8ad, TEXT = 0xffe8e2d4, MUTED = 0xff9aa0aa, INK = 0xff171717;
  /** Content stays readable on a wide landscape screen instead of spanning it. */
  static final int MAX_WIDTH_DP = 640;

  private UiStyle() {}

  static int dp(Activity activity, float value) {
    return Math.round(value * activity.getResources().getDisplayMetrics().density);
  }

  /** A centred column of at most MAX_WIDTH_DP inside a scroll view; returns the column. */
  static LinearLayout page(Activity activity) {
    activity.getWindow().setStatusBarColor(BACKGROUND);
    activity.getWindow().setNavigationBarColor(BACKGROUND);
    ScrollView scroll = new ScrollView(activity);
    scroll.setBackgroundColor(BACKGROUND);
    scroll.setFillViewport(true);
    FrameLayout frame = new FrameLayout(activity);
    final int max = dp(activity, MAX_WIDTH_DP);
    // Capped at every measure: the setup screen handles rotation itself
    // (configChanges), so a width computed once would go stale.
    LinearLayout column = new LinearLayout(activity) {
      @Override protected void onMeasure(int width, int height) {
        int size = View.MeasureSpec.getSize(width);
        super.onMeasure(size > max ? View.MeasureSpec.makeMeasureSpec(max, View.MeasureSpec.EXACTLY) : width, height);
      }
    };
    column.setOrientation(LinearLayout.VERTICAL);
    int pad = dp(activity, 20);
    column.setPadding(pad, pad, pad, pad);
    frame.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL));
    scroll.addView(frame);
    activity.setContentView(scroll);
    return column;
  }

  static TextView heading(Activity activity, LinearLayout box, String text) {
    TextView view = text(activity, box, text, 26, GOLD_LIGHT);
    view.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
    view.setLetterSpacing(0.04f);
    return view;
  }

  /**
   * The Builder that made this APK, as "Builder 12 (test)"; "local build"
   * when it was not built by the main repository's CI, "APK 50" for an APK
   * from a Builder that did not record itself.
   */
  static String apkCaption(JSONObject setup) {
    JSONObject builder = setup.optJSONObject("builder");
    if (builder == null) return "APK " + setup.optInt("androidBuild", 50);
    int build = builder.optInt("build", 0);
    return (build > 0 ? "Builder " + build : "local build") + " (" + builder.optString("channel", "test") + ")";
  }

  /** The installed APK and patch, like the version shown on the game's loading screen. */
  static TextView version(Activity activity, LinearLayout box, JSONObject setup) {
    String line = "TESL Reborn · " + apkCaption(setup);
    try {
      JSONObject current = PackInstaller.json(new File(activity.getExternalFilesDir(null), "tesl-reborn-update-status.json"))
          .optJSONObject("current");
      if (current != null) line += " · patch " + current.optInt("revision");
    } catch (Exception ignored) {}
    TextView view = text(activity, box, line, 14, MUTED);
    view.setPadding(0, 0, 0, dp(activity, 12));
    return view;
  }

  static TextView label(Activity activity, LinearLayout box, String text) {
    TextView view = text(activity, box, text, 15, GOLD);
    view.setTypeface(Typeface.DEFAULT_BOLD);
    view.setPadding(0, dp(activity, 14), 0, dp(activity, 4));
    return view;
  }

  static TextView body(Activity activity, LinearLayout box, String text) {
    return text(activity, box, text, 15, TEXT);
  }

  private static TextView text(Activity activity, LinearLayout box, String text, float size, int color) {
    TextView view = new TextView(activity);
    view.setText(text);
    view.setTextSize(size);
    view.setTextColor(color);
    view.setLineSpacing(0, 1.15f);
    box.addView(view);
    return view;
  }

  /** Gold for the main action of a screen, outlined for the rest. */
  static void button(Activity activity, Button button, boolean primary) {
    GradientDrawable shape = new GradientDrawable();
    shape.setCornerRadius(dp(activity, 6));
    if (primary) shape.setColor(GOLD);
    else { shape.setColor(PANEL); shape.setStroke(dp(activity, 1), GOLD); }
    button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x40ffffff), shape, null));
    button.setTextColor(new ColorStateList(new int[][] {{-android.R.attr.state_enabled}, {}},
        new int[] {0xff6b6f76, primary ? INK : GOLD_LIGHT}));
    button.setAllCaps(false);
    button.setTextSize(16);
    button.setTypeface(Typeface.DEFAULT_BOLD);
    button.setMinHeight(dp(activity, 52));
    button.setStateListAnimator(null);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    params.topMargin = dp(activity, 10);
    button.setLayoutParams(params);
  }

  /** Spinners, fields and switches on the dark page. */
  static void field(Activity activity, View view) {
    GradientDrawable shape = new GradientDrawable();
    shape.setCornerRadius(dp(activity, 6));
    shape.setColor(PANEL);
    view.setBackground(shape);
    int pad = dp(activity, 10);
    view.setPadding(pad, pad, pad, pad);
    view.setMinimumHeight(dp(activity, 48));
    if (view instanceof TextView) ((TextView) view).setTextColor(TEXT);
    if (view instanceof TextView) ((TextView) view).setHintTextColor(MUTED);
  }
}
