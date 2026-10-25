"""Execute the actual Android pack installer on the JVM using synthetic packs."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from builder.bootstrap_tools import download
from builder.server import ResourceServer


def pack(root, pack_id, files):
    entries = [
        dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        for name, data in files.items()
    ]
    manifest = dict(
        schema=1,
        format="tesl-reborn-pack-v1",
        id=pack_id,
        gameVersionCode=11009,
        files=entries,
    )
    path = root / (pack_id + ".zip")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("pack.json", json.dumps(manifest))
        for name, data in files.items():
            z.writestr(name, data)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    final = root / "packs" / f"{digest}.zip"
    final.parent.mkdir(exist_ok=True)
    path.rename(final)
    return dict(
        id=pack_id,
        path="packs/" + final.name,
        sha256=digest,
        bytes=final.stat().st_size,
        unpackedBytes=sum(len(v) for v in files.values()),
    )


HARNESS = """package org.teslreborn.setup;
import java.io.*; import java.net.*; import java.util.*; import org.json.*;
public class InstallerTest {
 public static void main(String[] a) throws Exception {
  File root=new File(a[0]),downloads=new File(a[1]);
  PackInstaller p=new PackInstaller(root,downloads,s->{});
  if(a[2].equals("archive")||a[2].equals("archive-reject")) {
    boolean reject=a[2].equals("archive-reject");
    try {
      DataArchive.install(new FileInputStream(a[3]),PackInstaller.json(new File(a[4])),new File(downloads,"archive"),p,
        (in,meta)->{
          File obb=new File(root,"game.obb");
          try(OutputStream out=new FileOutputStream(obb)) {byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
          if(obb.length()!=meta.getLong("bytes")||!PackInstaller.hash(obb).equals(meta.getString("sha256")))throw new IOException("OBB hash differs");
        },s->{});
      if(reject)throw new AssertionError("Unsafe archive accepted");
      p.verifyInstalled("common");p.verifyInstalled("ru_ru");
    } catch(Exception expected) {if(!reject)throw expected;}
    return;
  }
  if(a[2].equals("preview")) {
    int[] fit=PreviewSize.fit(945,1900,1280,960,90);
    if(fit[0]!=945||fit[1]!=1260)throw new AssertionError("Stretched portrait preview");
    fit=PreviewSize.fit(2000,945,1280,960,180);
    if(fit[0]!=1260||fit[1]!=945)throw new AssertionError("Stretched landscape preview");
    for(int rotation:new int[]{0,90,180,270}) {
      float[] q=PreviewSize.corners(945,1900,1280,960,rotation);
      double horizontal=Math.hypot(q[2]-q[0],q[3]-q[1])/1280;
      double vertical=Math.hypot(q[4]-q[0],q[5]-q[1])/960;
      if(Math.abs(horizontal-vertical)>.0001)throw new AssertionError("Nonuniform preview scale");
    }
    float[] texture=PreviewSize.textureCorners(945,1900,1280,960,90,0);
    if(texture[0]>=0 || Math.abs(texture[1])>.01 || Math.abs(texture[3])>.01 || Math.abs(texture[5]-1900)>.01)
      throw new AssertionError("Sensor rotation applied twice to TextureView");
    File oldDownloads=new File(downloads,"old"),newDownloads=new File(downloads,"persistent");oldDownloads.mkdirs();
    String filename=String.join("",Collections.nCopies(64,"a"))+".part";
    try(FileOutputStream file=new FileOutputStream(new File(oldDownloads,filename))){file.write(new byte[]{1,2,3});}
    PackInstaller.migrateDownloads(oldDownloads,newDownloads);
    if(new File(newDownloads,filename).length()!=3||new File(oldDownloads,filename).exists())throw new AssertionError("Partial download migration");
    File configRoot=new File(root,"updater-config");configRoot.mkdirs();
    JSONObject cfg=UpdateConfig.ensure(configRoot,"https://raw.githubusercontent.com/owner/repo/main/manifest.json");
    if(!cfg.optBoolean("enabled")||!cfg.optString("feedUrl").startsWith("https://raw."))throw new AssertionError("Missing update defaults");
    cfg.put("feedUrl", "").put("enabled", false).put("safeMode", true);
    PackInstaller.writeJson(new File(configRoot,"tesl-reborn-updater.json"),cfg);
    cfg=UpdateConfig.ensure(configRoot,"https://example.com/new.json");
    if(cfg.optBoolean("enabled")||!cfg.optBoolean("safeMode")||!cfg.optString("feedUrl").equals("https://example.com/new.json"))throw new AssertionError("Migration lost explicit settings");
    cfg.put("feedUrl","https://custom.example/feed.json");PackInstaller.writeJson(new File(configRoot,"tesl-reborn-updater.json"),cfg);
    if(!UpdateConfig.ensure(configRoot,"https://example.com/new.json").optString("feedUrl").equals("https://custom.example/feed.json"))throw new AssertionError("Overrode custom channel");
    File invalidRoot=new File(root,"bad-feed");invalidRoot.mkdirs();
    if(!UpdateConfig.ensure(invalidRoot,"http://unsafe.example/feed.json").optString("feedUrl").isEmpty())throw new AssertionError("Accepted plaintext default");
    CornerTaps taps=new CornerTaps(); long at=1000;
    for(int tap=0;tap<3;tap++) {
      taps.touch(0,1,10,10,100,at);boolean emitted=taps.touch(1,1,10,10,100,at+40);
      if(emitted!=(tap==2))throw new AssertionError("Android triple tap");
      if(taps.progress(at+40)!=(tap==2?0:tap+1))throw new AssertionError("Marker progress differs from detector");at+=100;
    }
    taps.touch(0,1,10,10,100,at);taps.touch(1,1,90,90,100,at+40);
    for(int tap=0;tap<2;tap++) {at+=100;taps.touch(0,1,10,10,100,at);if(taps.touch(1,1,10,10,100,at+40))throw new AssertionError("Swipe counted as tap");}
    String token="abcdefghijklmnopqrstuvwx01234567";
    String decoded=ConnectionLink.resourceUri("http://192.168.1.2:1234/connect/"+token);
    if(!decoded.equals("teslreborn://resources?url=http%3A%2F%2F192.168.1.2%3A1234%2F&token="+token))throw new AssertionError(decoded);
    if(!ConnectionLink.resourceUri(decoded).equals(decoded))throw new AssertionError("Legacy QR differs");
    if(!ConnectionLink.resourceUri("https://example.com/prefix/connect/"+token).contains("%2Fprefix%2F"))throw new AssertionError("Lost proxy prefix");
    for(String bad:new String[]{"http://8.8.8.8/connect/"+token,"http://192.168.1.2/connect/short","http://192.168.1.2/connect/"+token+"/../catalog.json","http://user@192.168.1.2/connect/"+token,"https://example.com/connect/"+token+"?extra=1"}) {
      try{ConnectionLink.resourceUri(bad);throw new AssertionError("Unsafe QR accepted");}catch(Exception expected){}
    }
    return;
  }
  if(a[2].equals("url-ok")){PackInstaller.baseUrl(a[3]);return;}
  if(a[2].equals("qr")){
    java.awt.image.BufferedImage image=javax.imageio.ImageIO.read(new File(a[3]));
    int w=image.getWidth(),h=image.getHeight();int[] rgb=image.getRGB(0,0,w,h,null,0,w);
    String value=new com.google.zxing.qrcode.QRCodeReader().decode(new com.google.zxing.BinaryBitmap(
      new com.google.zxing.common.HybridBinarizer(new com.google.zxing.RGBLuminanceSource(w,h,rgb)))).getText();
    if(!value.equals(a[4]))throw new AssertionError("QR value differs");return;
  }
  if(a[2].equals("url")) {try{PackInstaller.baseUrl(a[3]);throw new AssertionError("Unsafe URL accepted");}catch(IOException good){}return;}
  if(a[2].equals("reject")){JSONObject pack=PackInstaller.json(new File(a[4]));try{p.install(new File(a[3]),pack);throw new AssertionError("Bad pack accepted");}catch(IOException good){}return;}
  URL base=PackInstaller.baseUrl(a[2]);JSONObject catalog=p.catalog(base,a[3]);
  Map<String,JSONObject> byId=new HashMap<>();JSONArray packs=catalog.getJSONArray("packs");
  for(int i=0;i<packs.length();i++)byId.put(packs.getJSONObject(i).getString("id"),packs.getJSONObject(i));
  for(String id:new String[]{"common","ru_ru"}) {
   JSONObject meta=byId.get(id);File partial=new File(downloads,meta.getString("sha256")+".part");
   File source=new File(a[4],meta.getString("path"));
   try(InputStream in=new FileInputStream(source);OutputStream out=new FileOutputStream(partial)){byte[] b=new byte[37];int n=in.read(b);out.write(b,0,n);}
   File zip=p.download(base,a[3],meta);p.install(zip,meta);
   if(!p.installed(id))throw new AssertionError("Missing installed receipt");
  }
  if(catalog.has("obb")) {
    JSONObject obb=catalog.getJSONObject("obb");File file=p.download(base,a[3],obb);
    if(!PackInstaller.hash(file).equals(obb.getString("sha256")))throw new AssertionError("OBB hash");
    p.complete(base,a[3],new JSONObject().put("common",p.installedHash("common")).put("ru_ru",p.installedHash("ru_ru")),obb.getString("sha256"));
  } else p.complete(base,a[3],"ru_ru");
  p.verifyInstalled("ru_ru");
  File ruData=new File(root,"UnityCache/Shared/voice/"+String.join("",Collections.nCopies(32,"a"))+"/__data");
  // Verify corruption of the same size is detected, not just missing files.
  JSONObject receipt=PackInstaller.json(new File(root,".tesl-resources/ru_ru.json"));
  JSONArray entries=receipt.getJSONArray("files");
  for(int i=0;i<entries.length();i++)if(entries.getJSONObject(i).getString("path").endsWith("/__data"))
    ruData=new File(root,entries.getJSONObject(i).getString("path"));
  try(RandomAccessFile out=new RandomAccessFile(ruData,"rw")){out.write(0);}
  try{p.verifyInstalled("ru_ru");throw new AssertionError("Corrupt cache accepted");}catch(IOException good){}
  if(p.installed("ru_ru"))throw new AssertionError("Corrupt receipt retained");
  p.install(p.download(base,a[3],byId.get("ru_ru")),byId.get("ru_ru"));
  p.verifyInstalled("ru_ru");p.remove("ru_ru");
  if(p.installed("ru_ru")||!p.installed("common"))throw new AssertionError("Shared resources were removed");
  System.out.println("PASS native JVM: resumed streaming download, hashes, extraction, receipt, ACK and language removal");
 }
}
"""


def main():
    vendor = ROOT / "vendor"
    jar = vendor / "json-test.jar"
    download(
        "https://repo.maven.apache.org/maven2/org/json/json/20250517/json-20250517.jar",
        jar,
        "3ea61b2a06e31edf1c91134fe9106b0ebb16628be169f3db75bc7a2b06b45796",
    )
    java = shutil.which("java")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "InstallerTest.java"
        source.write_text(HARNESS, encoding="utf-8")
        classes = root / "classes"
        classes.mkdir()
        subprocess.run(
            [
                java,
                "-m",
                "jdk.compiler/com.sun.tools.javac.Main",
                "-encoding",
                "UTF-8",
                "--release",
                "8",
                "-cp",
                str(jar) + __import__("os").pathsep + str(vendor / "zxing-core.jar"),
                "-d",
                str(classes),
                str(ROOT / "android-setup/src/org/teslreborn/setup/PackInstaller.java"),
                str(ROOT / "android-setup/src/org/teslreborn/setup/DataArchive.java"),
                str(ROOT / "android-setup/src/org/teslreborn/setup/PreviewSize.java"),
                str(ROOT / "android-setup/src/org/teslreborn/setup/CornerTaps.java"),
                str(ROOT / "android-setup/src/org/teslreborn/setup/UpdateConfig.java"),
                str(
                    ROOT / "android-setup/src/org/teslreborn/setup/ConnectionLink.java"
                ),
                str(source),
            ],
            check=True,
        )
        import os

        command = [
            java,
            "-cp",
            os.pathsep.join(map(str, [classes, jar, vendor / "zxing-core.jar"])),
            "org.teslreborn.setup.InstallerTest",
            str(root / "phone"),
            str(root / "downloads"),
        ]
        catalog = root / "catalog"
        catalog.mkdir()
        common = pack(catalog, "common", {"versions.json": b'{"_entries":[]}'})
        ru = pack(
            catalog,
            "ru_ru",
            {
                "UnityCache/Shared/audio_1/"
                + "a" * 32
                + "/__data": b"converted audio fixture"
            },
        )
        obb_data = b"base game transfer fixture" * 100
        (catalog / "game.obb").write_bytes(obb_data)
        obb_meta = dict(
            id="obb",
            path="game.obb",
            bytes=len(obb_data),
            sha256=hashlib.sha256(obb_data).hexdigest(),
        )
        (catalog / "catalog.json").write_text(
            json.dumps(
                dict(
                    schema=1,
                    format="tesl-reborn-resources-v1",
                    gameVersionCode=11009,
                    abi="arm64-v8a",
                    packs=[common, ru],
                    obb=obb_meta,
                )
            )
        )
        server = ResourceServer(
            catalog, host="127.0.0.1", grace_seconds=100, log=lambda _: None
        ).start()
        # Drop the first resumed pack response halfway, then require the Java
        # downloader to reconnect at the newly saved byte offset automatically.
        original_handler = server.http.RequestHandlerClass
        drops, ranges = set(), []

        class FlakyHandler(original_handler):
            def do_GET(self):
                if self.path.startswith("/packs/"):
                    ranges.append(self.headers.get("Range"))
                    if self.path not in drops:
                        drops.add(self.path)
                        file = catalog / self.path.lstrip("/")
                        offset = 37
                        data = file.read_bytes()
                        self.send_response(206)
                        self.send_header("Content-Length", str(len(data) - offset))
                        self.send_header(
                            "Content-Range", f"bytes {offset}-{len(data)-1}/{len(data)}"
                        )
                        self.end_headers()
                        self.wfile.write(data[offset : offset + 43])
                        self.wfile.flush()
                        self.close_connection = True
                        return
                super().do_GET()

        server.http.RequestHandlerClass = FlakyHandler
        try:
            subprocess.run(
                [
                    *command,
                    f"http://127.0.0.1:{server.port}/",
                    server.token,
                    str(catalog),
                ],
                check=True,
            )
            assert server.finished_at is not None
            assert "bytes=80-" in ranges, ranges
        finally:
            server.stop()
        from builder.archive import write_data_archive

        archive = root / "data.zip"
        write_data_archive(catalog, archive, log=lambda _: None)
        expected_obb = root / "expected-obb.json"
        expected_obb.write_text(json.dumps(obb_meta))
        subprocess.run(
            [*command, "archive", str(archive), str(expected_obb)], check=True
        )
        subprocess.run([*command, "preview"], check=True)
        with zipfile.ZipFile(archive) as original:
            items = [(n, original.read(n)) for n in original.namelist()]
        bad_zip = root / "bad-data.zip"
        cases = [
            items + [("../escape", b"bad")],
            items[:-1],
            items + [items[1]],
            [("other.json", b"{}")],
        ]
        # Same ZIP entry size and valid CRC, but wrong expected SHA-256.
        changed = list(items)
        name, body = changed[-1]
        changed[-1] = (name, bytes([body[0] ^ 1]) + body[1:])
        cases.append(changed)
        for bad_items in cases:
            import warnings

            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(bad_zip, "w", zipfile.ZIP_DEFLATED) as z:
                    for name, body in bad_items:
                        z.writestr(name, body)
            subprocess.run(
                [*command, "archive-reject", str(bad_zip), str(expected_obb)],
                check=True,
            )
            assert not (root / "escape").exists()
        print(
            "PASS native JVM: streaming ZIP import, all included languages, corrupt/incomplete/traversing archives rejected, preview proportions"
        )
        for url in [
            "http://192.168.1.109:1234/",
            "http://100.89.61.30:1234/",
            "http://100.64.0.1/",
            "http://100.127.255.254/",
        ]:
            subprocess.run([*command, "url-ok", url], check=True)
        import qrcode

        qr_url = "teslreborn://resources?url=http%3A%2F%2F100.89.61.30%3A1234%2F&token=test-code"
        qr = root / "qr.png"
        qrcode.make(qr_url).save(qr)
        subprocess.run([*command, "qr", str(qr), qr_url], check=True)
        for bad in [
            "http://example.com/",
            "http://8.8.8.8/",
            "http://100.63.255.255/",
            "http://100.128.0.1/",
            "file:///tmp/",
            "https://example.com/?token=secret",
        ]:
            subprocess.run([*command, "url", bad], check=True)
        for name in [
            "../escape",
            "UnityCache/Shared/a/../__data",
            "versions.json/../escape",
        ]:
            bad = pack(catalog, "ru_ru", {name: b"bad"})
            meta = root / "bad.json"
            meta.write_text(json.dumps(bad))
            subprocess.run(
                [*command, "reject", str(catalog / bad["path"]), str(meta)], check=True
            )
            assert not (root / "escape").exists()
    print(
        "PASS native JVM: public plaintext/DNS/query URLs and traversing cache entries rejected"
    )


if __name__ == "__main__":
    main()
