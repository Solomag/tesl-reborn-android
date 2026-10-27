"""Run the real prelaunch stager on the JVM and boot its output in the API-1 JS loader."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HARNESS = r'''package org.teslreborn.setup;
import java.io.*;import java.nio.charset.*;import java.security.*;import org.json.*;
public class PrelaunchTest {
 static final String CODE="// TESL-REBORN-ANDROID-CORE v1\nglobalThis.prelaunchLoaded = true; globalThis.TeslRebornUpdater.ready();\n";
 static JSONObject meta(int revision)throws Exception{return new JSONObject().put("schema",1).put("format","tesl-reborn-hook-v1").put("loaderApi",1).put("gameVersionCode",11009).put("abi","arm64-v8a").put("revision",revision).put("version","test-"+revision).put("bytes",CODE.getBytes("UTF-8").length).put("sha256",PackInstaller.hex(MessageDigest.getInstance("SHA-256").digest(CODE.getBytes("UTF-8"))));}
 static JSONObject config()throws Exception{return new JSONObject().put("feedUrl","https://example.test/manifest.json");}
 static JSONObject manifest()throws Exception{return meta(51).put("url","https://example.test/core.js");}
 static PrelaunchUpdater.Transport transport(JSONObject manifest,byte[] code){return(url,limit,cancel)->url.endsWith("manifest.json")?manifest.toString().getBytes("UTF-8"):code;}
 static File dir(File root,String name){File file=new File(root,name);file.mkdirs();return file;}
 static File state(File root){return new File(root,"tesl-reborn-updater/state.json");}
 static void reject(RunnableChecked task)throws Exception{try{task.run();throw new AssertionError("Unsafe update accepted");}catch(IOException expected){}}
 interface RunnableChecked {void run()throws Exception;}
 public static void main(String[]args)throws Exception{
  File root=new File(args[0]);root.mkdirs();byte[] code=CODE.getBytes("UTF-8");
  File success=dir(root,"success");
  String result=PrelaunchUpdater.check(success,config(),meta(49),transport(manifest(),code),new PrelaunchUpdater.Cancellation(),s->{});
  if(!result.equals("staged"))throw new AssertionError(result);
  JSONObject saved=PackInstaller.json(state(success));
  if(saved.getJSONObject("pending").getInt("revision")!=51||!saved.isNull("active")||!saved.isNull("booting"))throw new AssertionError("Stager activated a trial before Unity boot");
  if(!PackInstaller.hash(new File(success,"tesl-reborn-updater/"+meta(51).getString("sha256")+".js")).equals(meta(51).getString("sha256")))throw new AssertionError("Stored core hash");
  if(!PrelaunchUpdater.check(success,config(),meta(49),transport(manifest(),code),new PrelaunchUpdater.Cancellation(),s->{}).equals("up-to-date"))throw new AssertionError("Pending floor ignored");
  for(String value:new String[]{"http://example.test/a","https://u:p@example.test/a","https://example.test/a?token=x","https://example.test/a#x"})reject(()->PrelaunchUpdater.origin(value));
  for(String key:new String[]{"revision","bytes","loaderApi"}){JSONObject bad=meta(51).put(key,1.5);reject(()->PrelaunchUpdater.validate(bad));bad.put(key,"1");reject(()->PrelaunchUpdater.validate(bad));}
  File corrupt=dir(root,"corrupt");reject(()->PrelaunchUpdater.check(corrupt,config(),meta(49),transport(manifest(),new byte[]{1,2,3}),new PrelaunchUpdater.Cancellation(),s->{}));
  if(state(corrupt).exists())throw new AssertionError("Corrupt data published state");
  File origin=dir(root,"origin");JSONObject other=manifest().put("url","https://other.test/core.js");reject(()->PrelaunchUpdater.check(origin,config(),meta(49),transport(other,code),new PrelaunchUpdater.Cancellation(),s->{}));
  for(String key:new String[]{"safeMode","enabled"}){
   JSONObject conf=config().put(key,key.equals("safeMode"));
   String value=PrelaunchUpdater.check(dir(root,key),conf,meta(49),(u,l,c)->{throw new AssertionError("Disabled updater fetched network");},new PrelaunchUpdater.Cancellation(),s->{});
   if(!value.equals("disabled"))throw new AssertionError(value);
  }
  File cancelled=dir(root,"cancelled");PrelaunchUpdater.Cancellation token=new PrelaunchUpdater.Cancellation();
  PrelaunchUpdater.Transport stop=(u,l,c)->{byte[] response=u.endsWith("manifest.json")?manifest().toString().getBytes("UTF-8"):code;if(!u.endsWith("manifest.json"))c.cancel();return response;};
  reject(()->PrelaunchUpdater.check(cancelled,config(),meta(49),stop,token,s->{}));if(state(cancelled).exists())throw new AssertionError("Cancelled update published");
  File warm=dir(root,"warm");if(!PrelaunchUpdater.check(warm,config(),meta(49),transport(manifest(),code),new PrelaunchUpdater.Cancellation(),s->{},()->false).equals("game-already-running")||state(warm).exists())throw new AssertionError("Running Unity state changed");
  File recovery=dir(root,"recovery");PackInstaller.writeJson(state(recovery),new JSONObject().put("schema",1).put("rejected",new JSONArray()).put("booting",meta(51).getString("sha256")));
  if(!PrelaunchUpdater.check(recovery,config(),meta(49),(u,l,c)->{throw new AssertionError("Recovery fetched update");},new PrelaunchUpdater.Cancellation(),s->{}).equals("recovery-first"))throw new AssertionError("Recovery state overwritten");
  File old=dir(root,"old");if(!PrelaunchUpdater.check(old,config(),meta(49),transport(meta(48),code),new PrelaunchUpdater.Cancellation(),s->{}).equals("up-to-date")||state(old).exists())throw new AssertionError("Downgrade accepted");
  File rejected=dir(root,"rejected");PackInstaller.writeJson(state(rejected),new JSONObject().put("schema",1).put("rejected",new JSONArray().put(meta(51).getString("sha256"))));
  if(!PrelaunchUpdater.check(rejected,config(),meta(49),transport(manifest(),code),new PrelaunchUpdater.Cancellation(),s->{}).equals("rejected"))throw new AssertionError("Rejected core retried");
  // A running game: the launcher only reads the manifest and offers a restart.
  File running=dir(root,"running");
  PrelaunchUpdater.Offer offer=PrelaunchUpdater.offer(running,config(),meta(49),(u,l,c)->{if(!u.endsWith("manifest.json"))throw new AssertionError("Offer downloaded the core");return manifest().toString().getBytes("UTF-8");},new PrelaunchUpdater.Cancellation());
  if(!offer.newer()||offer.manifest.getInt("revision")!=51||state(running).exists())throw new AssertionError("Offer must report a newer core without writing state");
  if(PrelaunchUpdater.offer(success,config(),meta(49),transport(manifest(),code),new PrelaunchUpdater.Cancellation()).newer())throw new AssertionError("Offer ignored the staged core");
  if(!PrelaunchUpdater.offer(rejected,config(),meta(49),transport(manifest(),code),new PrelaunchUpdater.Cancellation()).status.equals("rejected"))throw new AssertionError("Offer proposed a rejected core");
  if(!PrelaunchUpdater.offer(recovery,config(),meta(49),(u,l,c)->{throw new AssertionError("Recovery fetched update");},new PrelaunchUpdater.Cancellation()).status.equals("recovery-first"))throw new AssertionError("Offer during recovery");
  PackInstaller.writeJson(new File(root,"embedded.json"),meta(49));
  try(FileOutputStream out=new FileOutputStream(new File(root,"embedded.js"))){out.write(code);}
  System.out.println("PASS JVM prelaunch: staging, hashes, HTTPS/origin, schema, cancellation, disabled/safe mode, live-process guard, rollback and revision floors");
 }
}'''

def main():
    java = shutil.which('java')
    jar = ROOT / 'vendor/json-test.jar'
    if not jar.is_file():
        raise SystemExit('Run android-setup/test_native.py first to prepare json-test.jar')
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        source = root / 'PrelaunchTest.java'
        source.write_text(HARNESS)
        classes = root / 'classes'
        classes.mkdir()
        package = ROOT / 'android-setup/src/org/teslreborn/setup'
        subprocess.run([java,'-m','jdk.compiler/com.sun.tools.javac.Main','--release','8','-cp',str(jar),'-d',str(classes),str(package/'PackInstaller.java'),str(package/'PrelaunchUpdater.java'),str(source)],check=True)
        fixture = root / 'phone'
        subprocess.run([java,'-cp',os.pathsep.join(map(str,[classes,jar])),'org.teslreborn.setup.PrelaunchTest',str(fixture)],check=True)
        subprocess.run(['node',str(ROOT/'tests/prelaunch-loader.cjs'),str(fixture)],cwd=ROOT,check=True)

if __name__ == '__main__':
    main()
