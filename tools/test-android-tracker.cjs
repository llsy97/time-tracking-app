'use strict';
// Invoke JUnit directly: Gradle's Windows worker loses non-ASCII classpath
// entries on some JDKs, even though javac and the release build handle them.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const java=process.env.JAVA_HOME||'C:\\Program Files\\Android\\Android Studio\\jbr';
const executable=path.join(java,'bin',process.platform==='win32'?'java.exe':'java');
const env={...process.env,ANDROID_HOME:process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA||'', 'Android','Sdk')};
function run(args,cwd=root){const result=spawnSync(executable,args,{cwd,env,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status)process.exit(result.status);}
run(['-jar','gradle/wrapper/gradle-wrapper.jar','--no-daemon',':app:compileDebugUnitTestJavaWithJavac'],path.join(root,'android'));
const cache=path.join(process.env.GRADLE_USER_HOME||path.join(os.homedir(),'.gradle'),'caches','modules-2','files-2.1');
function jar(module,version,name){const folder=path.join(cache,...module.split('/'),version);for(const hash of fs.readdirSync(folder)){const file=path.join(folder,hash,name);if(fs.existsSync(file))return file;}throw new Error('Missing test dependency: '+name);}
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'moa-tracker-test-'));
for(const [target,source] of [['tests','debugUnitTest/compileDebugUnitTestJavaWithJavac'],['main','debug/compileDebugJavaWithJavac']])fs.cpSync(path.join(root,'android/app/build/intermediates/javac',source,'classes'),path.join(temporary,target),{recursive:true});
const classpath=[path.join(temporary,'tests'),path.join(temporary,'main'),jar('junit/junit','4.13.2','junit-4.13.2.jar'),jar('org.hamcrest/hamcrest-core','1.3','hamcrest-core-1.3.jar'),jar('org.json/json','20240303','json-20240303.jar')];
run(['-cp',classpath.join(path.delimiter),'org.junit.runner.JUnitCore','app.moa.timetracker.TrackerJournalTest']);
