package org.teslreborn.setup;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.EditText;
import java.lang.reflect.Field;

/**
 * Unity shows the text being typed in its own dialog above the keyboard, with
 * a hard-coded white background and the system font (deck search, chat). The
 * dialog is kept in a field of the UnityPlayer; after a tap it is looked up and
 * given the game's colours and a serif font.
 */
final class SoftInputStyle {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final long[] CHECKS = {150, 400, 900};

  private SoftInputStyle() {}

  static void afterTap(Activity activity) {
    for (long delay : CHECKS)
      MAIN.postDelayed(() -> {
        try { style(activity); } catch (Throwable ignored) { /* The game keeps Unity's look. */ }
      }, delay);
  }

  private static void style(Activity activity) throws Exception {
    if (activity.isFinishing() || activity.isDestroyed()) return;
    Object player = field(activity, "mUnityPlayer");
    if (player == null) return;
    for (Class<?> type = player.getClass(); type != null && type != Object.class; type = type.getSuperclass())
      for (Field field : type.getDeclaredFields()) {
        if (!Dialog.class.isAssignableFrom(field.getType())) continue;
        field.setAccessible(true);
        Dialog dialog = (Dialog) field.get(player);
        if (dialog == null || !dialog.isShowing()) continue;
        Window window = dialog.getWindow();
        if (window == null) continue;
        View root = window.getDecorView();
        if (Boolean.TRUE.equals(root.getTag(R_TAG))) continue;
        root.setTag(R_TAG, Boolean.TRUE);
        root.setBackgroundColor(UiStyle.BACKGROUND);
        paint(activity, root);
      }
  }

  // Any id from the framework works as a tag key for a view we do not own.
  private static final int R_TAG = android.R.id.custom;

  private static void paint(Activity activity, View view) {
    if (view instanceof EditText) {
      EditText edit = (EditText) view;
      edit.setTextColor(UiStyle.TEXT);
      edit.setHintTextColor(UiStyle.MUTED);
      edit.setTypeface(Typeface.SERIF);
      edit.setBackground(frame(activity, UiStyle.PANEL));
      int pad = UiStyle.dp(activity, 10);
      edit.setPadding(pad, pad / 2, pad, pad / 2);
    } else if (view instanceof Button) {
      Button button = (Button) view;
      button.setTextColor(UiStyle.GOLD_LIGHT);
      button.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
      button.setBackground(frame(activity, UiStyle.INK));
    } else if (view instanceof ViewGroup) {
      view.setBackgroundColor(UiStyle.BACKGROUND);
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) paint(activity, group.getChildAt(i));
    }
  }

  private static GradientDrawable frame(Activity activity, int fill) {
    GradientDrawable shape = new GradientDrawable();
    shape.setColor(fill);
    shape.setStroke(UiStyle.dp(activity, 1.5f), UiStyle.GOLD);
    shape.setCornerRadius(UiStyle.dp(activity, 4));
    return shape;
  }

  private static Object field(Object owner, String name) {
    for (Class<?> type = owner.getClass(); type != null; type = type.getSuperclass())
      try {
        Field field = type.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(owner);
      } catch (NoSuchFieldException next) {
        // Look in the superclass.
      } catch (IllegalAccessException denied) {
        return null;
      }
    return null;
  }
}
