'use strict';
let cloudBusy = false;
let cloudMode = 'signin';
let cloudReady = false;
let lastVerificationSent = 0;
const isCloudAccount = () => state.session?.startsWith('cloud:');
function cloudError(error) {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'Unable to create this account. Try signing in or resetting your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password with at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Check your internet connection and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Allow pop-ups for this site, then try Google sign-in again.',
    'auth/unauthorized-domain': 'This app domain still needs to be enabled in Google Cloud.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
    'auth/user-disabled': 'This account is disabled.',
    'auth/account-exists-with-different-credential': 'Sign in using the method you originally used for this email.'
  };
  return messages[error?.code] || (error?.code ? 'Sign-in could not be completed. Please try again.' : error?.message) || 'Please try again.';
}
function cloudSetMode(mode) {
  cloudMode = mode;
  const signup = mode === 'signup';
  $('cloudHeading').textContent = signup ? 'Make space for your day.' : 'Welcome back.';
  $('cloudNameField').classList.toggle('hidden', !signup);
  $('cloudConfirmField').classList.toggle('hidden', !signup);
  $('cloudConfirm').required = signup;
  $('cloudSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('cloudPassword').autocomplete = signup ? 'new-password' : 'current-password';
  $('cloudPassword').value = ''; $('cloudConfirm').value = '';
  $('cloudError').textContent = ''; $('cloudMessage').textContent = '';
  document.querySelectorAll('[data-cloud-mode]').forEach(button => {
    button.classList.toggle('selected', button.dataset.cloudMode === mode);
    button.setAttribute('aria-pressed', String(button.dataset.cloudMode === mode));
  });
}
function renderVerification() {
  const user = window.MoaAuth?.user;
  const pending = !!user && !user.emailVerified;
  $('cloudCredentials').classList.toggle('hidden', pending);
  $('cloudVerification').classList.toggle('hidden', !pending);
  if (pending) $('verificationEmail').textContent = user.email || 'your email address';
}
function openCloudAuth() {
  $('settingsDialog').close();
  cloudSetMode('signin'); renderVerification(); showDialog('cloudAuthDialog');
}
// Only an identity returned by the SDK can select a cloud workspace. A saved
// workspace ID alone never restores a cloud login. Existing local records stay intact.
function syncCloudUser(user) {
  const verified = user?.emailVerified === true;
  const id = verified ? `cloud:${user.uid}` : null;
  if (!id && !isCloudAccount()) { renderVerification(); return; }
  const changed = state.session !== id;
  if (!commit(next => {
    if (next.session !== id) {
      const active = workspace(next).entries.find(entry => !entry.endedAt);
      if (active) T.finish(active);
    }
    if (id) {
      let account = next.accounts.find(account => account.id === id);
      if (!account) { account = { id, provider: 'cloud' }; next.accounts.push(account); }
      account.username = user.displayName || user.email || 'Your account';
      account.email = user.email;
      next.workspaces[id] ||= blankWorkspace();
    }
    next.session = id;
  })) return;
  if (changed) { document.querySelectorAll('dialog[open]').forEach(dialog => { if (dialog.id !== 'cloudAuthDialog') dialog.close(); }); loadFields(); }
  render(); renderVerification();
  if (id) $('cloudAuthDialog').close();
}
async function cloudAction(action) {
  if (cloudBusy) return;
  cloudBusy = true;
  const buttons = [...$('cloudAuthDialog').querySelectorAll('button')];
  buttons.forEach(button => button.disabled = true);
  $('cloudError').textContent = ''; $('cloudMessage').textContent = '';
  try {
    if (!cloudReady) { await window.MoaAuth.ready; cloudReady = true; }
    await action();
  } catch (error) { $('cloudError').textContent = cloudError(error); }
  finally {
    cloudBusy = false; buttons.forEach(button => button.disabled = false); renderVerification();
    $('cloudPassword').value = ''; $('cloudConfirm').value = '';
  }
}
$('cloudAuthForm').addEventListener('submit', event => {
  event.preventDefault();
  const email = $('cloudEmail').value.trim();
  const password = $('cloudPassword').value;
  const signup = cloudMode === 'signup';
  if (signup && password !== $('cloudConfirm').value) { $('cloudError').textContent = 'The passwords do not match.'; return; }
  cloudAction(async () => {
    const user = signup ? await window.MoaAuth.signup(email, password, $('cloudName').value.trim()) : await window.MoaAuth.signin(email, password);
    syncCloudUser(user);
    if (signup) { lastVerificationSent = Date.now(); $('cloudMessage').textContent = 'Verification email sent. Check your inbox and spam folder.'; }
    else if (!user.emailVerified) $('cloudMessage').textContent = 'Verify your email to finish signing in. You can resend the email below.';
    else toast('Signed in. Your time records are saved on this device.');
  });
});
document.querySelectorAll('[data-cloud-mode]').forEach(button => button.addEventListener('click', () => cloudSetMode(button.dataset.cloudMode)));
$('cloudGoogle').addEventListener('click', () => cloudAction(async () => { syncCloudUser(await window.MoaAuth.google()); }));
$('verificationCheck').addEventListener('click', () => cloudAction(async () => {
  const user = await window.MoaAuth.refresh(); syncCloudUser(user);
  if (!user) $('cloudMessage').textContent = 'Please sign in again.';
  else if (!user.emailVerified) $('cloudMessage').textContent = 'Your email is not verified yet. Open the link in the email, then check again.';
  else toast('Email verified. Welcome to moa.');
}));
$('verificationResend').addEventListener('click', () => cloudAction(async () => {
  if (Date.now() - lastVerificationSent < 60000) { $('cloudMessage').textContent = 'Please wait a minute before requesting another email.'; return; }
  await window.MoaAuth.resend(); lastVerificationSent = Date.now();
  $('cloudMessage').textContent = 'Verification email sent. Check your inbox and spam folder.';
}));
$('verificationCancel').addEventListener('click', () => cloudAction(async () => { await window.MoaAuth.signout(); syncCloudUser(null); cloudSetMode('signin'); }));
$('cloudReset').addEventListener('click', () => {
  if (!$('cloudEmail').reportValidity()) return;
  cloudAction(async () => {
    try { await window.MoaAuth.reset($('cloudEmail').value.trim()); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    $('cloudMessage').textContent = 'If this email has an account, you will receive a password reset link.';
  });
});
$('cloudLocal').addEventListener('click', () => cloudAction(async () => {
  await window.MoaAuth.signout();
  syncCloudUser(null);
  $('cloudAuthDialog').close(); openLocalAuth();
}));
$('cloudAuthDialog').addEventListener('close', () => { $('cloudPassword').value = ''; $('cloudConfirm').value = ''; });
$('cloudAuthDialog').addEventListener('cancel', event => { if (cloudBusy) event.preventDefault(); });
window.MoaAuth.ready.then(() => {
  cloudReady = true;
  syncCloudUser(window.MoaAuth.user);
  window.MoaAuth.subscribe(user => { if (!cloudBusy) syncCloudUser(user); });
}).catch(() => {
  if (isCloudAccount()) syncCloudUser(null);
  toast('Account restore was unavailable. Please sign in again.');
}).finally(() => document.body.classList.remove('auth-loading'));
window.addEventListener('storage', event => {
  if (cloudReady && (event.key === STORE || event.key === null) && isCloudAccount() && state.session !== `cloud:${window.MoaAuth.user?.uid}`) syncCloudUser(window.MoaAuth.user);
});
