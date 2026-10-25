package org.teslreborn.setup;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.net.URL;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.ZipFile;
import org.json.*;

/** Runs before Unity: resources can be installed without a game login or ADB. */
public final class ResourceActivity extends Activity {
  private static final String[] CODES = {
    "system", "en_us", "de_de", "es_es", "es_mx", "fr_fr", "it_it", "pl_pl", "pt_br", "ru_ru",
    "tr_tr"
  };
  private static final String[] LABELS = {
    "Phone system language",
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
  private TextView status, connectionHint;
  private String requestedLanguage;
  private Spinner language;
  private Button launch, download, embedded, remove;
  private final List<Button> actions = new ArrayList<>();
  private Spinner uiLanguage;
  private String uiCode = "en_us";
  private File obbFile;
  private boolean initialized = false;
  private boolean dataChanged = false;
  private boolean busy = false;
  private File root;

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    try {
      root = getExternalFilesDir(null);
      if (root == null) throw new IOException("App storage is unavailable");
      File downloads = new File(getFilesDir(), "tesl-resource-downloads");
      PackInstaller.migrateDownloads(new File(getCacheDir(), "tesl-resource-downloads"), downloads);
      installer = new PackInstaller(root, downloads, this::message);
      PackInstaller.writeJson(
          new File(root, "tesl-reborn-setup.json"),
          new JSONObject().put("api", 1).put("debugInput", "android-key-events"));
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
      obbFile = new File(getObbDir(), "main.11009." + getPackageName() + ".obb");
      uiCode = getPreferences(0).getString("uiLanguage", "en_us");
      applyLink(getIntent());
      // Route before inflating the setup UI. Normal launches never draw it
      // when the selected data is present; explicit Game data links still do.
      if (readyFor(selected()) && (getIntent().getData() == null || applyRequested())) {
        if (applyRequested()) launchGame();
        else startGame();
        return;
      }
      buildUi();
      applyLink(getIntent());
      initialized = true;
      refresh();
      if (chooseLanguageRequested()) showLanguageChoice();
      else if (setup.getJSONArray("embeddedPacks").length() > 0 && !ready()) installEmbedded();

    } catch (Exception e) {
      new AlertDialog.Builder(this)
          .setTitle("Game data setup")
          .setMessage(e.toString())
          .setPositiveButton("Close", (d, w) -> finish())
          .show();
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    applyLink(intent);
    if (chooseLanguageRequested()) showLanguageChoice();
    else if (applyRequested() && ready()) launchGame();
  }

  private boolean chooseLanguageRequested() {
    Uri data = getIntent().getData();
    return data != null
        && "teslreborn".equals(data.getScheme())
        && "resources".equals(data.getHost())
        && "1".equals(data.getQueryParameter("chooseLanguage"));
  }

  private void showLanguageChoice() {
    if (busy || language == null) return;
    new AlertDialog.Builder(this)
        .setTitle(tr("Game language at launch"))
        .setSingleChoiceItems(
            LABELS,
            language.getSelectedItemPosition(),
            (dialog, position) -> {
              requestedLanguage = null;
              language.setSelection(position);
              dialog.dismiss();
              // setSelection may dispatch its listener later. Read the spinner
              // in the posted action, then use precisely the Game data path.
              language.post(
                  () -> {
                    refresh();
                    if (ready()) launchGame();
                    else message(tr("Download the missing language pack, then launch the game."));
                  });
            })
        .setNegativeButton(tr("Cancel"), (dialog, which) -> finish())
        .setOnCancelListener(dialog -> finish())
        .show();
  }

  private boolean applyRequested() {
    Uri data = getIntent().getData();
    return data != null
        && "teslreborn".equals(data.getScheme())
        && "resources".equals(data.getHost())
        && "1".equals(data.getQueryParameter("apply"));
  }

  private void applyLink(Intent intent) {
    Uri data = intent.getData();
    if (data != null
        && "teslreborn".equals(data.getScheme())
        && "resources".equals(data.getHost())) {
      String url = data.getQueryParameter("url"), key = data.getQueryParameter("token");
      if (url != null && address != null) address.setText(url);
      if (key != null && token != null) {
        token.setText(key);
        if (connectionHint != null)
          connectionHint.setText(
              tr(
                  "QR code scanned. Choose your language, then tap Choose language packs and"
                      + " download."));
      }
      String code = data.getQueryParameter("language");
      if (code != null)
        for (int i = 0; i < CODES.length; i++)
          if (CODES[i].equals(code)) {
            requestedLanguage = code;
            if (language != null) language.setSelection(i);
          }
    }
  }

  private void buildUi() {
    actions.clear();
    ScrollView scroll = new ScrollView(this);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(1);
    box.setPadding(24, 24, 24, 24);
    scroll.addView(box);
    setContentView(scroll);
    TextView heading = new TextView(this);
    heading.setText("TESL Reborn · Android 30\n" + tr("Game data setup"));
    heading.setTextSize(24);
    box.addView(heading);
    TextView hint = new TextView(this);
    hint.setText(
        tr(
            "Choose a game language. To download from your PC, start transfer in the builder and"
                + " scan its QR code. Wi-Fi and Tailscale need no certificate."));
    box.addView(hint);
    TextView interfaceLabel = new TextView(this);
    interfaceLabel.setText(tr("Interface language"));
    box.addView(interfaceLabel);
    uiLanguage = new Spinner(this);
    uiLanguage.setAdapter(
        new ArrayAdapter<String>(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            Arrays.copyOfRange(LABELS, 1, LABELS.length)));
    for (int i = 1; i < CODES.length; i++)
      if (CODES[i].equals(uiCode)) uiLanguage.setSelection(i - 1);
    box.addView(uiLanguage);
    uiLanguage.setOnItemSelectedListener(
        new AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(AdapterView<?> p) {}

          public void onItemSelected(AdapterView<?> p, View v, int i, long id) {
            if (!CODES[i + 1].equals(uiCode)) {
              uiCode = CODES[i + 1];
              getPreferences(0).edit().putString("uiLanguage", uiCode).commit();
              if (!busy) {
                String previousAddress = address.getText().toString();
                String previousToken = token.getText().toString();
                buildUi();
                address.setText(previousAddress);
                token.setText(previousToken);
                refresh();
              }
            }
          }
        });
    TextView gameLabel = new TextView(this);
    gameLabel.setText(tr("Game language at launch"));
    box.addView(gameLabel);
    String savedGameSelection = selection();
    language = new Spinner(this);
    language.setAdapter(
        new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, LABELS));
    box.addView(language);
    String saved = savedGameSelection;
    for (int i = 0; i < CODES.length; i++) if (CODES[i].equals(saved)) language.setSelection(i);
    Button system = new Button(this);
    system.setText(tr("Use system language for the game"));
    system.setOnClickListener(v -> language.setSelection(0));
    box.addView(system);
    actions.add(system);
    LinearLayout advanced = new LinearLayout(this);
    advanced.setOrientation(1);
    advanced.setVisibility(View.GONE);
    address = new EditText(this);
    address.setSingleLine(true);
    address.setHint("http://192.168.1.10:12345/");
    address.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
    address.setText(getPreferences(0).getString("address", ""));
    advanced.addView(address);
    token = new EditText(this);
    token.setSingleLine(true);
    token.setHint(tr("Connection code shown on your PC"));
    token.setInputType(
        android.text.InputType.TYPE_CLASS_TEXT
            | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
    advanced.addView(token);
    button(
        box,
        "Scan QR code to download game data from your PC",
        () -> startActivityForResult(new Intent(this, ScanActivity.class), 10));
    connectionHint = new TextView(this);
    connectionHint.setTextColor(0xff26703a);
    box.addView(connectionHint);
    download = button(box, "Choose language packs and download", () -> download());
    button(
        advanced,
        "Import OBB file",
        () -> {
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          intent.setType("*/*");
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          startActivityForResult(intent, 11);
        });
    button(
        box,
        "Import data ZIP",
        () -> {
          Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
          intent.setType("*/*");
          intent.addCategory(Intent.CATEGORY_OPENABLE);
          startActivityForResult(intent, 12);
        });
    embedded = button(advanced, "Install included language packs", () -> installEmbedded());
    remove =
        button(
            advanced,
            "Remove selected language",
            () -> {
              final String code = selected();
              new AlertDialog.Builder(this)
                  .setMessage("Remove installed language " + code + "?")
                  .setNegativeButton("Cancel", null)
                  .setPositiveButton("Remove", (d, w) -> runMutation(() -> installer.remove(code)))
                  .show();
            });
    button(
        box,
        "Advanced",
        () ->
            advanced.setVisibility(
                advanced.getVisibility() == View.GONE ? View.VISIBLE : View.GONE));
    box.addView(advanced);
    launch = button(box, "Launch game", () -> launchGame());
    status = new TextView(this);
    status.setTextIsSelectable(true);
    box.addView(status);
    language.setOnItemSelectedListener(
        new android.widget.AdapterView.OnItemSelectedListener() {
          public void onNothingSelected(android.widget.AdapterView<?> parent) {}

          public void onItemSelected(
              android.widget.AdapterView<?> parent, View view, int position, long id) {
            if (initialized)
              getPreferences(0)
                  .edit()
                  .putString("language", CODES[position])
                  .putInt("setupVersion", 2)
                  .apply();
            refresh();
            if (initialized && !busy && !installer.installed(selected())) {
              JSONArray included = setup.optJSONArray("embeddedPacks");
              for (int i = 0; i < included.length(); i++) {
                JSONObject pack = included.optJSONObject(i);
                if (pack != null && selected().equals(pack.optString("id"))) {
                  installEmbedded();
                  break;
                }
              }
            }
          }
        });
  }

  private Button button(LinearLayout box, String text, Runnable action) {
    Button b = new Button(this);
    actions.add(b);
    b.setText(tr(text));
    b.setOnClickListener(v -> action.run());
    box.addView(b);
    return b;
  }

  private String selection() {
    if (language != null) return CODES[language.getSelectedItemPosition()];
    if (requestedLanguage != null) return requestedLanguage;
    String value =
        getPreferences(0).getInt("setupVersion", 0) >= 2
            ? getPreferences(0).getString("language", setup.optString("defaultLanguage", "en_us"))
            : setup.optString("defaultLanguage", "en_us");
    return Arrays.asList(CODES).contains(value) ? value : "en_us";
  }

  private String selected() {
    String code = selection();
    if (!code.equals("system")) return code;
    return systemLanguageCode();
  }

  static String systemLanguageCode() {
    Locale locale =
        android.content.res.Resources.getSystem().getConfiguration().getLocales().get(0);
    String lang = locale.getLanguage();
    if (lang.equals("es")) return locale.getCountry().equals("MX") ? "es_mx" : "es_es";
    for (String c : CODES) if (c.startsWith(lang + "_")) return c;
    return "en_us";
  }

  private boolean obbReady() {
    return verifiedObb(obbFile, setup, getPreferences(0));
  }

  static boolean verifiedObb(File obbFile, JSONObject setup, SharedPreferences prefs) {
    try {
      if (obbFile == null || !obbFile.isFile()) return false;
      JSONObject expected = setup.optJSONObject("obb");
      if (expected != null && obbFile.length() != expected.getLong("bytes")) return false;
      try (ZipFile zip = new ZipFile(obbFile)) {
        return zip.getEntry("assets/versions.json") != null
            && (expected == null
                || prefs.getLong("obbSize", -1) == obbFile.length()
                    && prefs.getLong("obbModified", -1) == obbFile.lastModified()
                    && expected.getString("sha256").equals(prefs.getString("obbHash", "")));
      }
    } catch (Exception e) {
      return false;
    }
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (installer != null && setup != null && language != null) {
      refresh();
      if (!busy && obbFile != null && obbFile.isFile() && !obbReady())
        run(
            () -> {
              JSONObject expected = setup.optJSONObject("obb");
              if (expected != null) {
                message("Checking base game data…");
                if (obbFile.length() != expected.getLong("bytes")
                    || !PackInstaller.hash(obbFile).equals(expected.getString("sha256")))
                  throw new IOException(
                      "Base game data is incomplete or corrupt. Import it again or download it from"
                          + " your PC.");
                rememberObb(expected);
              }
            });
    }
  }

  private void stopGameProcess() {
    ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
    java.util.List<ActivityManager.RunningAppProcessInfo> processes =
        manager.getRunningAppProcesses();
    if (processes != null)
      for (ActivityManager.RunningAppProcessInfo process : processes)
        if (getPackageName().equals(process.processName)
            && process.uid == android.os.Process.myUid()
            && process.pid != android.os.Process.myPid())
          android.os.Process.killProcess(process.pid);
  }

  private String tr(String value) {
    return UiStrings.text(uiCode, value);
  }

  private boolean ready() {
    return obbReady() && installer.installed("common") && installer.installed(selected());
  }

  private void refresh() {
    if (status == null) return;
    boolean ready = ready();
    for (Button action : actions) action.setEnabled(!busy);
    launch.setEnabled(!busy && ready);
    download.setEnabled(!busy);
    embedded.setEnabled(!busy && setup.optJSONArray("embeddedPacks").length() > 0);
    remove.setEnabled(!busy && installer.installed(selected()));
    language.setEnabled(!busy);
    uiLanguage.setEnabled(!busy);
    status.setText(
        tr("Game language at launch")
            + ": "
            + selected()
            + "\n"
            + tr("Base game data (OBB)")
            + ": "
            + tr(obbReady() ? "Installed" : "Missing")
            + "\n"
            + tr("Common resources")
            + ": "
            + tr(installer.installed("common") ? "Installed" : "Missing")
            + "\n"
            + tr("Language pack")
            + ": "
            + tr(installer.installed(selected()) ? "Installed" : "Missing")
            + "\n"
            + (ready()
                ? tr("Ready to launch")
                : tr(
                    "Install the missing items above. APK alone does not include the base game"
                        + " data.")));
  }

  private void message(String text) {
    runOnUiThread(
        () -> {
          if (status != null && !isDestroyed()) status.setText(tr(text));
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
                if (isDestroyed()) return;
                busy = false;
                if (error != null && status == null) {
                  buildUi();
                  initialized = true;
                  applyLink(getIntent());
                }
                refresh();
                if (error != null)
                  new AlertDialog.Builder(this)
                      .setTitle(tr("Transfer incomplete"))
                      .setMessage(error)
                      .setPositiveButton("OK", null)
                      .show();
              });
        });
  }

  private void markMutation() {
    stopGameProcess();
    dataChanged = true;
  }

  private void runMutation(Task task) {
    run(
        () -> {
          markMutation();
          task.run();
        });
  }

  private void installEmbedded() {
    final String code = selected();
    run(
        () -> {
          if (obbFile.isFile() && !obbReady()) verifyExistingObb();
          JSONArray packs = setup.getJSONArray("embeddedPacks");
          for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i);
            String id = pack.getString("id");
            if (installer.installed(id)
                && installer.installedHash(id).equals(pack.getString("sha256"))) continue;
            message("Installing " + id);
            File file = new File(getCacheDir(), pack.getString("sha256") + ".embedded");
            if (getCacheDir().getUsableSpace() < pack.getLong("bytes") + 32L * 1024 * 1024)
              throw new IOException("Not enough space to install the included pack");
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
              markMutation();
              installer.install(file, pack);
            } finally {
              file.delete();
            }
          }
        });
  }

  private void download() {
    final String url = address.getText().toString().trim(), key = token.getText().toString().trim();
    getPreferences(0).edit().putString("address", url).apply();
    run(
        () -> {
          JSONObject catalog = installer.catalog(PackInstaller.baseUrl(url), key);
          runOnUiThread(() -> chooseDownloads(url, key, catalog));
        });
  }

  private void chooseDownloads(String url, String key, JSONObject catalog) {
    if (isDestroyed()) return;
    try {
      List<String> ids = new ArrayList<>(), labels = new ArrayList<>();
      JSONArray packs = catalog.getJSONArray("packs");
      for (int i = 0; i < packs.length(); i++) {
        String id = packs.getJSONObject(i).getString("id");
        if (id.equals("common")) continue;
        ids.add(id);
        int index = Arrays.asList(CODES).indexOf(id);
        labels.add((index > 0 ? LABELS[index] : id) + (installer.installed(id) ? " ✓" : ""));
      }
      if (ids.isEmpty()) throw new IOException("No languages were prepared on the PC.");
      boolean[] checked = new boolean[ids.size()];
      Set<String> previous =
          getPreferences(0).getStringSet("downloadLanguages", Collections.emptySet());
      for (int i = 0; i < checked.length; i++)
        checked[i] = ids.get(i).equals(selected()) || previous.contains(ids.get(i));
      new AlertDialog.Builder(this)
          .setTitle("Choose languages to download")
          .setMultiChoiceItems(
              labels.toArray(new String[0]),
              checked,
              (d, which, enabled) -> checked[which] = enabled)
          .setNegativeButton("Cancel", null)
          .setNeutralButton(
              "Download all", (d, w) -> downloadPacks(url, key, catalog, new LinkedHashSet<>(ids)))
          .setPositiveButton(
              "Download selected",
              (d, w) -> {
                Set<String> selected = new LinkedHashSet<>();
                for (int i = 0; i < checked.length; i++) if (checked[i]) selected.add(ids.get(i));
                if (selected.isEmpty()) {
                  message("Select at least one language.");
                  return;
                }
                downloadPacks(url, key, catalog, selected);
              })
          .show();
    } catch (Exception e) {
      message(e.getMessage());
    }
  }

  private void downloadPacks(String url, String key, JSONObject catalog, Set<String> languages) {
    getPreferences(0).edit().putStringSet("downloadLanguages", new HashSet<>(languages)).apply();
    run(
        () -> {
          URL base = PackInstaller.baseUrl(url);
          if (!obbReady()) {
            JSONObject obb = catalog.optJSONObject("obb");
            if (obb == null)
              throw new IOException(
                  "This previous build cannot transfer OBB. Rebuild with Android 29 or import the"
                      + " OBB file.");
            JSONObject expected = setup.optJSONObject("obb");
            if (expected != null && !expected.getString("sha256").equals(obb.getString("sha256")))
              throw new IOException("Base game data does not match this APK");
            File file = installer.download(base, key, obb);
            installObb(new FileInputStream(file), obb);
            file.delete();
          }
          JSONArray packs = catalog.getJSONArray("packs");
          Map<String, JSONObject> byId = new HashMap<>();
          for (int i = 0; i < packs.length(); i++)
            byId.put(packs.getJSONObject(i).getString("id"), packs.getJSONObject(i));
          Set<String> wanted = new LinkedHashSet<>();
          wanted.add("common");
          wanted.addAll(languages);
          for (String id : wanted) {
            JSONObject pack = byId.get(id);
            if (installer.installed(id)
                && installer.installedHash(id).equals(pack.getString("sha256"))) continue;
            File file = installer.download(base, key, pack);
            markMutation();
            installer.install(file, pack);
            file.delete();
          }
          JSONObject installed = new JSONObject();
          if (!obbReady()) throw new IOException("Base game data is incomplete");
          for (String id : wanted) {
            installer.verifyInstalled(id);
            installed.put(id, installer.installedHash(id));
          }
          if (!key.isEmpty())
            try {
              String hash = catalog.has("obb") ? PackInstaller.hash(obbFile) : "";
              installer.complete(base, key, installed, hash);
            } catch (Exception e) {
              message(
                  "Resources installed; the PC did not receive confirmation. Transfer will stop"
                      + " after the idle timeout.");
            }
        });
  }

  private void launchGame() {
    if (!ready()) {
      refresh();
      return;
    }
    final String code = selected();
    run(
        () -> {
          message("Checking installed resources…");
          installer.verifyInstalled("common");
          installer.verifyInstalled(code);
          runOnUiThread(() -> startGame());
        });
  }

  private void startGame() {
    if (isDestroyed()) return;
    try {
      String code = selected();
      boolean system = selection().equals("system");
      String previousLanguage = "";
      try {
        previousLanguage =
            PackInstaller.json(new File(root, "tesl-reborn-language.json")).optString("language");
      } catch (Exception ignored) {
      }
      PackInstaller.writeJson(
          new File(root, "tesl-reborn-language.json"),
          new JSONObject().put("language", code).put("system", system));
      getPreferences(0)
          .edit()
          .putBoolean("setupComplete", true)
          .putInt("setupVersion", 2)
          .putString("language", selection())
          .commit();
      // Unity runs in the main process; the preparation screen lives in :resources.
      // Always start a clean Unity process after resources or language changes.
      if (dataChanged || !code.equals(previousLanguage)) stopGameProcess();
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

  private boolean readyFor(String code) {
    return obbReady() && installer.installed("common") && installer.installed(code);
  }

  private void verifyExistingObb() throws Exception {
    JSONObject expected = setup.optJSONObject("obb");
    if (expected == null) return;
    message("Checking base game data…");
    if (obbFile.length() != expected.getLong("bytes")
        || !PackInstaller.hash(obbFile).equals(expected.getString("sha256")))
      throw new IOException(
          "Base game data is incomplete or corrupt. Import or download it again.");
    rememberObb(expected);
  }

  private void rememberObb(JSONObject meta) throws Exception {
    getPreferences(0)
        .edit()
        .putLong("obbSize", obbFile.length())
        .putLong("obbModified", obbFile.lastModified())
        .putString("obbHash", meta.getString("sha256"))
        .commit();
  }

  private void installObb(InputStream source, JSONObject meta) throws Exception {
    File part = new File(getObbDir(), obbFile.getName() + ".part");
    try (InputStream in = source) {
      if (meta == null) throw new IOException("Missing OBB metadata; rebuild this APK");
      PackInstaller.mkdir(getObbDir());
      if (part.exists() && !part.delete()) throw new IOException("Cannot replace partial OBB");
      if (getObbDir().getUsableSpace() < meta.getLong("bytes") + 32L * 1024 * 1024)
        throw new IOException("Not enough space for base game data");
      try {
        try (FileOutputStream out = new FileOutputStream(part)) {
          byte[] b = new byte[1024 * 1024];
          int n;
          long size = 0;
          while ((n = in.read(b)) != -1) {
            size += n;
            if (size > meta.getLong("bytes")) throw new IOException("Oversized OBB");
            out.write(b, 0, n);
          }
          out.getFD().sync();
        }
        if (part.length() != meta.getLong("bytes")
            || !PackInstaller.hash(part).equals(meta.getString("sha256")))
          throw new IOException("Base game data is incomplete or corrupt");
        markMutation();
        PackInstaller.atomic(part, obbFile);
        rememberObb(meta);
      } finally {
        part.delete();
      }
    }
  }

  @Override
  protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (result != RESULT_OK || data == null) {
      refresh();
      return;
    }
    if (request == 10) {
      Intent link = new Intent(Intent.ACTION_VIEW, data.getData());
      applyLink(link);
      connectionHint.setText(
          tr(
              "QR code scanned. Choose your language, then tap Choose language packs and"
                  + " download."));
      download.requestFocus();
      download.announceForAccessibility(connectionHint.getText());
    } else if (request == 12 && data.getData() != null) {
      final Uri uri = data.getData();
      run(
          () ->
              DataArchive.install(
                  getContentResolver().openInputStream(uri),
                  setup.optJSONObject("obb"),
                  new File(getCacheDir(), "tesl-import"),
                  installer,
                  (in, meta) -> installObb(in, meta),
                  this::message));
    } else if (request == 11 && data.getData() != null) {
      final Uri uri = data.getData();
      run(() -> installObb(getContentResolver().openInputStream(uri), setup.optJSONObject("obb")));
    }
  }

  @Override
  public void onBackPressed() {
    if (busy) {
      message("Wait for the transfer to finish or close the app through Android settings.");
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
