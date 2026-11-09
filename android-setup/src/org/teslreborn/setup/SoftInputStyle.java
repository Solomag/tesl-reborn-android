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
    watchFocus(activity);
    for (long delay : CHECKS)
      MAIN.postDelayed(() -> {
        try { style(activity); } catch (Throwable error) {
          // The game keeps Unity's look.
          android.util.Log.w("tesl-setup", "soft input: " + error);
        }
      }, delay);
  }

  /**
   * The text dialog can open later than the checks after a tap (the login
   * fields on a Pixel 6 Pro). The game's window loses focus to the dialog
   * the moment it opens; that runs the same look-up.
   */
  private static void watchFocus(Activity activity) {
    View decor = activity.getWindow().getDecorView();
    if (WATCHED.put(decor, Boolean.TRUE) != null) return;
    decor.getViewTreeObserver().addOnWindowFocusChangeListener(hasFocus -> {
      if (hasFocus) return;
      for (long delay : new long[] {30, 200, 600})
        MAIN.postDelayed(() -> {
          try { style(activity); } catch (Throwable error) { android.util.Log.w("tesl-setup", "soft input: " + error); }
        }, delay);
    });
  }

  private static final java.util.Map<View, Object> WATCHED = new java.util.WeakHashMap<>();

  private static void style(Activity activity) throws Exception {
    if (activity.isFinishing() || activity.isDestroyed()) return;
    Object player = field(activity, "mUnityPlayer");
    if (player == null) { android.util.Log.i("tesl-setup", "soft input: no mUnityPlayer in " + activity.getClass().getName()); return; }
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
        if (STYLED.put(root, Boolean.TRUE) != null) continue;
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
    if (Long.valueOf(at).equals(MARKED.put(edit, at))) return;
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
    android.util.Log.i("tesl-setup", "autofill: visible box marked " + hint);
    companion(activity, edit, View.AUTOFILL_HINT_PASSWORD.equals(hint));
    android.view.autofill.AutofillManager manager =
        activity.getSystemService(android.view.autofill.AutofillManager.class);
    // A manual requestAutofill shows the drop-down list, which SafeInCloud
    // cannot draw in night mode (its dark rows fail to inflate). Ending the
    // session and focusing the box again makes an automatic request, whose
    // suggestions appear in the keyboard as before - now with both fields.
    if (manager != null && manager.isEnabled()) {
      manager.cancel();
      edit.clearFocus();
      edit.requestFocus();
    }
  }

  /**
   * Unity opens a separate text dialog for each field, so a password manager
   * never sees the username and the password together: it fills the password
   * and has nowhere to put the username (or offers nothing for the username
   * alone). A 1-pixel box of the other kind sits next to the visible one; what
   * the manager fills into it is handed to the hook, which puts it into the
   * other field of the login form (tesl-reborn-autofill-fill.json).
   */
  private static void companion(Activity activity, EditText edit, boolean visibleIsPassword) {
    if (!(edit.getParent() instanceof ViewGroup)) return;
    ViewGroup parent = (ViewGroup) edit.getParent();
    View old = parent.findViewWithTag(COMPANION);
    if (old != null) parent.removeView(old);
    EditText other = new EditText(activity);
    other.setTag(COMPANION);
    other.setSingleLine(true);
    other.setTextColor(android.graphics.Color.TRANSPARENT);
    other.setBackground(null);
    other.setPadding(0, 0, 0, 0);
    other.setFocusable(false);
    other.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
    String field = visibleIsPassword ? "username" : "password";
    if (visibleIsPassword) {
      other.setInputType(android.text.InputType.TYPE_CLASS_TEXT);
      other.setAutofillHints(View.AUTOFILL_HINT_USERNAME);
    } else {
      other.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
      other.setAutofillHints(View.AUTOFILL_HINT_PASSWORD);
    }
    other.addTextChangedListener(new android.text.TextWatcher() {
      @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence text, int start, int before, int count) {}
      @Override public void afterTextChanged(android.text.Editable text) {
        if (text.length() == 0) return;
        try {
          java.io.File file = new java.io.File(activity.getExternalFilesDir(null), "tesl-reborn-autofill-fill.json");
          java.nio.file.Files.write(file.toPath(), new org.json.JSONObject().put("field", field)
              .put("value", text.toString()).put("at", System.currentTimeMillis()).toString()
              .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception ignored) {
          // The player types that field by hand.
        }
      }
    });
    parent.addView(other, parent.indexOfChild(edit) + 1, new ViewGroup.LayoutParams(1, 1));
    android.util.Log.i("tesl-setup", "autofill: " + field + " companion added to " + parent.getClass().getSimpleName());
  }

  private static final String COMPANION = "tesl-reborn-autofill-companion";

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

  private static final java.util.Map<View, Object> MARKED = new java.util.WeakHashMap<>();

  // View.setTag(int, Object) takes only an id of the app itself: a framework
  // id threw IllegalArgumentException on every touch, so nothing here ran.
  private static final java.util.Map<View, Object> STYLED = new java.util.WeakHashMap<>();

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
