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
        autofill(activity, root);
        if (Boolean.TRUE.equals(root.getTag(R_TAG))) continue;
        root.setTag(R_TAG, Boolean.TRUE);
        root.setBackgroundColor(UiStyle.BACKGROUND);
        paint(activity, root);
      }
  }

  /**
   * Password managers fill only a text box that Android knows is a username
   * or a password. The hook writes which login field opened the keyboard
   * (tesl-reborn-autofill.json); that box is marked and autofill is offered.
   */
  private static void autofill(Activity activity, View root) {
    EditText edit = firstEdit(root);
    if (edit == null) return;
    String hint = null;
    long at = 0;
    try {
      java.io.File file = new java.io.File(activity.getExternalFilesDir(null), "tesl-reborn-autofill.json");
      if (file.isFile() && file.length() < 1024) {
        org.json.JSONObject state = new org.json.JSONObject(new String(
            java.nio.file.Files.readAllBytes(file.toPath()), java.nio.charset.StandardCharsets.UTF_8));
        at = state.optLong("at");
        if (Math.abs(System.currentTimeMillis() - at) < 5000) {
          String field = state.optString("field");
          if ("password".equals(field)) hint = View.AUTOFILL_HINT_PASSWORD;
          else if ("username".equals(field)) hint = View.AUTOFILL_HINT_USERNAME;
        }
      }
    } catch (Exception ignored) {
      // No hint: the box stays as Unity made it.
    }
    // Once per keyboard opening: the dialog may be reused for another field.
    if (Long.valueOf(at).equals(edit.getTag(R_AUTOFILL))) return;
    edit.setTag(R_AUTOFILL, at);
    if (hint == null) {
      edit.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
      return;
    }
    edit.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
    // Unity's box is single-line text; a password box must say so for the
    // managers that match on the input type.
    if (View.AUTOFILL_HINT_PASSWORD.equals(hint))
      edit.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
    edit.setAutofillHints(hint);
    android.view.autofill.AutofillManager manager =
        activity.getSystemService(android.view.autofill.AutofillManager.class);
    if (manager != null && manager.isEnabled()) manager.requestAutofill(edit);
  }

  private static EditText firstEdit(View view) {
    if (view instanceof EditText) return (EditText) view;
    if (!(view instanceof ViewGroup)) return null;
    ViewGroup group = (ViewGroup) view;
    for (int i = 0; i < group.getChildCount(); i++) {
      EditText found = firstEdit(group.getChildAt(i));
      if (found != null) return found;
    }
    return null;
  }

  private static final int R_AUTOFILL = android.R.id.edit;

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
