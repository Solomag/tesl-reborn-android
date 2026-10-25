package org.teslreborn.setup;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.net.URL;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Runs before Unity: resources can be installed without a game login or ADB. */
public final class ResourceActivity extends Activity {
  private static final String[] CODES = {
    "system", "en_us", "de_de", "es_es", "es_mx", "fr_fr", "it_it", "pl_pl", "pt_br", "ru_ru",
    "tr_tr"
  };
  private static final String[] LABELS = {
    "По системе телефона",
    "English",
    "Deutsch",
    "Español",
    "Español (México)",
    "Français",
    "Italiano",
    "Polski",
    "Português (Brasil)",
    "Русский",
    "Türkçe"
  };
  private ExecutorService worker = Executors.newSingleThreadExecutor();
  private PackInstaller installer;
  private JSONObject setup;
  private EditText address, token;
  private TextView status;
  private Spinner language;
  private Button launch, download, embedded, remove;
  private boolean busy = false;
  private File root;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    try {
      root = getExternalFilesDir(null);
      if (root == null) throw new IOException("Хранилище приложения недоступно");
      installer =
          new PackInstaller(
              root, new File(getCacheDir(), "tesl-resource-downloads"), this::message);
      PackInstaller.writeJson(
          new File(root, "tesl-reborn-setup.json"), new JSONObject().put("api", 1));
      try (InputStream in = getAssets().open("tesl-reborn/setup.json")) {
        setup = new JSONObject(new String(PackInstaller.read(in, 256 * 1024), "UTF-8"));
      }
      File updaterConfig = new File(root, "tesl-reborn-updater.json");
      if (!updaterConfig.exists())
        PackInstaller.writeJson(
            updaterConfig,
            new JSONObject()
                .put("enabled", true)
                .put("feedUrl", setup.optString("hookFeed", ""))
                .put("allowLocalUpdates", false)
                .put("safeMode", false));
      buildUi();
      applyLink(getIntent());
      String saved =
          getPreferences(0).getString("language", setup.optString("defaultLanguage", "system"));
      for (int i = 0; i < CODES.length; i++) if (CODES[i].equals(saved)) language.setSelection(i);
      refresh();
      if (setup.getJSONArray("embeddedPacks").length() > 0 && !ready()) installEmbedded();
      else if (ready()
          && getPreferences(0).getBoolean("setupComplete", false)
          && getIntent().getData() == null) launchGame();
    } catch (Exception e) {
      new AlertDialog.Builder(this)
          .setTitle("Подготовка ресурсов")
          .setMessage(e.toString())
          .setPositiveButton("Закрыть", (d, w) -> finish())
          .show();
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    applyLink(intent);
  }

  private void applyLink(Intent intent) {
    Uri data = intent.getData();
    if (data != null
        && "teslreborn".equals(data.getScheme())
        && "resources".equals(data.getHost())) {
      String url = data.getQueryParameter("url"), key = data.getQueryParameter("token");
      if (url != null) address.setText(url);
      if (key != null) token.setText(key);
    }
  }

  private void buildUi() {
    ScrollView scroll = new ScrollView(this);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(1);
    box.setPadding(24, 24, 24, 24);
    scroll.addView(box);
    setContentView(scroll);
    TextView heading = new TextView(this);
    heading.setText("TESL Reborn · Android 25\nПодготовка ресурсов");
    heading.setTextSize(24);
    box.addView(heading);
    TextView hint = new TextView(this);
    hint.setText(
        "Выберите язык. Встроенные пакеты устанавливаются с телефона. Для отдельных пакетов"
            + " запустите передачу в сборщике на ПК и введите адрес и код. Для внешнего сервера"
            + " используйте HTTPS. Для смены языка уже запущенной игры потребуется полный"
            + " перезапуск приложения.");
    box.addView(hint);
    language = new Spinner(this);
    language.setAdapter(
        new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, LABELS));
    box.addView(language);
    Button system = new Button(this);
    system.setText("Вернуть язык системы");
    system.setOnClickListener(v -> language.setSelection(0));
    box.addView(system);
    address = new EditText(this);
    address.setSingleLine(true);
    address.setHint("http://192.168.1.10:12345/");
    address.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    address.setText(getPreferences(0).getString("address", ""));
    box.addView(address);
    token = new EditText(this);
    token.setSingleLine(true);
    token.setHint("Временный код доступа (для сервера сборщика)");
    token.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT
            | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
    box.addView(token);
    download = button(box, "Скачать общие ресурсы и выбранный язык", () -> download());
    embedded = button(box, "Установить встроенные пакеты", () -> installEmbedded());
    remove =
        button(
            box,
            "Удалить выбранный языковой пакет",
            () -> {
              final String code = selected();
              new AlertDialog.Builder(this)
                  .setMessage("Удалить установленный пакет " + code + "?")
                  .setNegativeButton("Отмена", null)
                  .setPositiveButton("Удалить", (d, w) -> run(() -> installer.remove(code)))
                  .show();
            });
    launch = button(box, "Запустить игру", () -> launchGame());
    status = new TextView(this);
    status.setTextIsSelectable(true);
    box.addView(status);
    language.setOnItemSelectedListener(
        new android.widget.AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(android.widget.AdapterView<?> parent) {}

          public void onItemSelected(
              android.widget.AdapterView<?> parent, View view, int position, long id) {
            getPreferences(0).edit().putString("language", CODES[position]).apply();
            refresh();
          }
        });
  }

  private Button button(LinearLayout box, String text, Runnable action) {
    Button b = new Button(this);
    b.setText(text);
    b.setOnClickListener(v -> action.run());
    box.addView(b);
    return b;
  }

  private String selected() {
    String code = CODES[language.getSelectedItemPosition()];
    if (!code.equals("system")) return code;
    Locale locale = systemLocale();
    String lang = locale.getLanguage();
    if (lang.equals("es")) return locale.getCountry().equals("MX") ? "es_mx" : "es_es";
    for (String c : CODES) if (c.startsWith(lang + "_")) return c;
    return "en_us";
  }

  private Locale systemLocale() {
    return android.content.res.Resources.getSystem().getConfiguration().getLocales().get(0);
  }

  private boolean obbReady() {
    return new File(getObbDir(), "main.11009." + getPackageName() + ".obb").isFile();
  }

  private boolean ready() {
    return obbReady() && installer.installed("common") && installer.installed(selected());
  }

  private void refresh() {
    if (status == null) return;
    boolean ready = ready();
    launch.setEnabled(!busy && ready);
    download.setEnabled(!busy);
    embedded.setEnabled(!busy && setup.optJSONArray("embeddedPacks").length() > 0);
    remove.setEnabled(!busy && installer.installed(selected()));
    language.setEnabled(!busy);
    status.setText(
        "Язык: "
            + selected()
            + "\nOBB: "
            + (obbReady()
                ? "найден"
                : "скопируйте main.11009." + getPackageName() + ".obb в " + getObbDir())
            + "\nОбщие ресурсы: "
            + (installer.installed("common") ? "установлены" : "нужны")
            + "\nПакет языка: "
            + (installer.installed(selected()) ? "установлен" : "нужен")
            + "\nУстановщик ресурсов v1 · APK 25");
  }

  private void message(String text) {
    runOnUiThread(
        () -> {
          if (status != null) status.setText(text);
        });
  }

  private interface Task {
    void run() throws Exception;
  }

  private void run(Task task) {
    if (busy) return;
    busy = true;
    refresh();
    worker.execute(
        () -> {
          String failure = null;
          try {
            task.run();
          } catch (Exception e) {
            failure = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
          }
          final String error = failure;
          runOnUiThread(
              () -> {
                busy = false;
                refresh();
                if (error != null)
                  new AlertDialog.Builder(this)
                      .setTitle("Передача не завершена")
                      .setMessage(error)
                      .setPositiveButton("OK", null)
                      .show();
              });
        });
  }

  private void installEmbedded() {
    final String code = selected();
    run(
        () -> {
          JSONArray packs = setup.getJSONArray("embeddedPacks");
          for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i);
            String id = pack.getString("id");
            if (!id.equals("common") && !id.equals(code)) continue;
            if (installer.installed(id)
                && installer.installedHash(id).equals(pack.getString("sha256"))) continue;
            message("Извлечение встроенного пакета " + id);
            File file = new File(getCacheDir(), pack.getString("sha256") + ".embedded");
            if (getCacheDir().getUsableSpace() < pack.getLong("bytes") + 32L * 1024 * 1024)
              throw new IOException("Недостаточно места для извлечения пакета");
            try {
              try (InputStream in = getAssets().open("tesl-reborn/" + pack.getString("path"));
                  FileOutputStream out = new FileOutputStream(file)) {
                byte[] b = new byte[1024 * 1024];
                int n;
                long size = 0;
                while ((n = in.read(b)) != -1) {
                  size += n;
                  if (size > pack.getLong("bytes"))
                    throw new IOException("Oversized embedded pack");
                  out.write(b, 0, n);
                }
                out.getFD().sync();
              }
              installer.install(file, pack);
            } finally {
              file.delete();
            }
          }
        });
  }

  private void download() {
    final String url = address.getText().toString().trim(),
        key = token.getText().toString().trim(),
        code = selected();
    getPreferences(0).edit().putString("address", url).apply();
    run(
        () -> {
          URL base = PackInstaller.baseUrl(url);
          JSONObject catalog = installer.catalog(base, key);
          JSONArray packs = catalog.getJSONArray("packs");
          Map<String, JSONObject> byId = new HashMap<>();
          for (int i = 0; i < packs.length(); i++)
            byId.put(packs.getJSONObject(i).getString("id"), packs.getJSONObject(i));
          if (!byId.containsKey(code))
            throw new IOException(
                "На сервере нет пакета " + code + ". Подготовьте его в сборщике ПК.");
          for (String id : new String[] {"common", code}) {
            JSONObject pack = byId.get(id);
            if (installer.installed(id)
                && installer.installedHash(id).equals(pack.getString("sha256"))) continue;
            File file = installer.download(base, key, pack);
            installer.install(file, pack);
            file.delete();
          }
          if (!key.isEmpty())
            try {
              installer.complete(base, key, code);
            } catch (Exception e) {
              message(
                  "Ресурсы установлены; подтверждение серверу не доставлено. Сервер выключится по"
                      + " таймеру.");
            }
        });
  }

  private void launchGame() {
    if (!ready()) return;
    try {
      String code = selected();
      boolean system = CODES[language.getSelectedItemPosition()].equals("system");
      PackInstaller.writeJson(
          new File(root, "tesl-reborn-language.json"),
          new JSONObject().put("language", code).put("system", system));
      getPreferences(0).edit().putBoolean("setupComplete", true).apply();
      Locale locale =
          system
              ? systemLocale()
              : new Locale(code.substring(0, 2), code.substring(3).toUpperCase(Locale.ROOT));
      Locale.setDefault(locale);
      Configuration config = new Configuration(getResources().getConfiguration());
      config.setLocale(locale);
      getResources().updateConfiguration(config, getResources().getDisplayMetrics());
      Intent intent = new Intent(Intent.ACTION_MAIN);
      intent.addCategory(Intent.CATEGORY_LAUNCHER);
      intent.setClassName(getPackageName(), setup.getString("gameActivity"));
      intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
      startActivity(intent);
      finish();
    } catch (Exception e) {
      new AlertDialog.Builder(this).setMessage(e.toString()).setPositiveButton("OK", null).show();
    }
  }

  @Override
  public void onBackPressed() {
    if (busy) {
      message("Дождитесь завершения передачи или закройте приложение через настройки Android.");
      return;
    }
    super.onBackPressed();
  }

  @Override
  public void onDestroy() {
    worker.shutdownNow();
    super.onDestroy();
  }
}
