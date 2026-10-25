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
    with zipfile.ZipFile(path, "w") as z:
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
  p.complete(base,a[3],"ru_ru");p.remove("ru_ru");
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
                str(jar),
                "-d",
                str(classes),
                str(ROOT / "android-setup/src/org/teslreborn/setup/PackInstaller.java"),
                str(source),
            ],
            check=True,
        )
        import os

        command = [
            java,
            "-cp",
            os.pathsep.join(map(str, [classes, jar])),
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
        (catalog / "catalog.json").write_text(
            json.dumps(
                dict(
                    schema=1,
                    format="tesl-reborn-resources-v1",
                    gameVersionCode=11009,
                    abi="arm64-v8a",
                    packs=[common, ru],
                )
            )
        )
        server = ResourceServer(
            catalog, host="127.0.0.1", grace_seconds=100, log=lambda _: None
        ).start()
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
        finally:
            server.stop()
        for bad in [
            "http://example.com/",
            "http://8.8.8.8/",
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
