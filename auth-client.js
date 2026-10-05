import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signInWithCredential, sendEmailVerification,
  sendPasswordResetEmail, reload, updateProfile, signOut } from 'firebase/auth';
import config from './auth-config.json';

const auth = getAuth(initializeApp(config));
auth.languageCode = 'en';
const native = () => window.Capacitor?.isNativePlatform();
window.MoaAuth = {
  ready: auth.authStateReady(),
  get user() { return auth.currentUser; },
  subscribe: callback => onAuthStateChanged(auth, callback),
  async signup(email, password, name) {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(user, { displayName: name });
    await sendEmailVerification(user);
    return user;
  },
  async signin(email, password) { return (await signInWithEmailAndPassword(auth, email, password)).user; },
  async google() {
    if (native()) {
      if (!config.googleWebClientId) throw new Error('Google sign-in for Android is awaiting configuration. Email sign-in is available.');
      const result = await window.Capacitor.Plugins.MoaGoogle.signIn({ clientId: config.googleWebClientId });
      return (await signInWithCredential(auth, GoogleAuthProvider.credential(result.idToken))).user;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return (await signInWithPopup(auth, provider)).user;
  },
  async refresh() { if (auth.currentUser) await reload(auth.currentUser); return auth.currentUser; },
  async resend() {
    if (!auth.currentUser || auth.currentUser.emailVerified) return;
    await sendEmailVerification(auth.currentUser);
  },
  reset: email => sendPasswordResetEmail(auth, email),
  async signout() {
    await signOut(auth);
    if (native()) await window.Capacitor.Plugins.MoaGoogle?.signOut().catch(() => {});
  }
};
