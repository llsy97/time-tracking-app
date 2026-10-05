'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
const java = process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk };
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build command failed (${result.status}): ${command}`);
}
// Invoke Java directly to preserve non-ASCII workspace paths on Windows.
run(path.join(java, 'bin', 'java.exe'), ['-jar', 'gradle/wrapper/gradle-wrapper.jar', '--no-daemon', 'assembleRelease'], path.join(root, 'android'));
const signing = path.join(root, '.artifacts', 'android-signing');
fs.mkdirSync(signing, { recursive: true });
const key = path.join(signing, 'moa-release.jks');
const passwordFile = path.join(signing, 'password.txt');
if (!fs.existsSync(passwordFile)) {
  if (fs.existsSync(key)) throw new Error('Signing password missing. Restore it from your backup.');
  fs.writeFileSync(passwordFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}
env.MOA_SIGNING_PASSWORD = fs.readFileSync(passwordFile, 'utf8').trim();
if (!fs.existsSync(key)) run(path.join(java, 'bin', 'keytool.exe'), ['-genkeypair', '-keystore', path.relative(root, key), '-storepass:env', 'MOA_SIGNING_PASSWORD', '-keypass:env', 'MOA_SIGNING_PASSWORD', '-alias', 'moa', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=moa Android, O=moa, C=US']);
const tools = path.join(sdk, 'build-tools', '36.0.0');
const unsigned = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
const aligned = path.join(root, 'dist', 'moa-aligned.apk');
const output = path.join(root, 'dist', 'moa-1.0.0.apk');
run(path.join(tools, 'zipalign.exe'), ['-f', '-p', '4', path.relative(root, unsigned), path.relative(root, aligned)]);
const signer = path.join(tools, 'lib', 'apksigner.jar');
run(path.join(java, 'bin', 'java.exe'), ['-jar', signer, 'sign', '--ks', path.relative(root, key), '--ks-key-alias', 'moa', '--ks-pass', 'env:MOA_SIGNING_PASSWORD', '--key-pass', 'env:MOA_SIGNING_PASSWORD', '--out', path.relative(root, output), path.relative(root, aligned)]);
run(path.join(java, 'bin', 'java.exe'), ['-jar', signer, 'verify', '--verbose', path.relative(root, output)]);
console.log(`Signed APK: ${output}\nBack up .artifacts/android-signing securely; future updates require this key.`);
