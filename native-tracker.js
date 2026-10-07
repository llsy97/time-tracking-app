'use strict';
if (window.Capacitor?.isNativePlatform()) {
  document.documentElement.classList.add('native-app');
  const ios = window.Capacitor.getPlatform?.() === 'ios';
  const nativeTracker = window.Capacitor.Plugins.MoaTracker;
  const section = document.createElement('section');
  section.className='settings-section widget-settings';
  section.innerHTML=ios
    ? '<h3>Widgets & lock screen</h3><p>Keep your task and timer close. Widget controls open moa to start, pause or finish a block.</p><button type="button" id="pinTrackerWidget" class="secondary">How to add a widget</button><p>Home Screen: touch and hold an empty area, choose Edit → Add Widget, then search for moa.</p><p>Lock Screen: touch and hold the screen, choose Customize → Lock Screen → Add Widgets, then moa.</p>'
    : '<h3>Widgets & lock screen</h3><p>Keep your timer close. Widget controls open moa to start, pause or finish a block.</p><button type="button" id="pinTrackerWidget" class="secondary">Add home screen widget</button><button type="button" id="lockTrackerToggle" class="secondary" aria-pressed="false">Enable lock screen controls</button><p>On Galaxy, allow moa notifications on the Lock screen in phone Settings. Cover-screen and lock-screen widget placement depends on your phone and One UI version.</p>';
  $('settingsDialog').insertBefore(section,$('settingsDialog').querySelector('.settings-brand'));
  let notificationEnabled=false, actionBusy=false;
  function paintNotificationSetting(){const b=$('lockTrackerToggle');b.textContent=notificationEnabled?'Disable lock screen controls':'Enable lock screen controls';b.setAttribute('aria-pressed',String(notificationEnabled));}
  if(!ios)nativeTracker.getSettings().then(result=>{notificationEnabled=result.notifications;paintNotificationSetting();}).catch(()=>{});
  $('pinTrackerWidget').addEventListener('click',async()=>{
    if(ios){toast('Touch and hold the Home or Lock Screen, choose Add Widgets, then search for moa.');return;}
    try {const result=await nativeTracker.pinWidget();if(!result.supported)toast('Long-press your home screen, choose Widgets, then moa.');}
    catch {toast('Long-press your home screen, choose Widgets, then moa.');}
  });
  $('lockTrackerToggle')?.addEventListener('click',async()=>{
    try {const result=await nativeTracker.setNotifications({enabled:!notificationEnabled});notificationEnabled=result.enabled;paintNotificationSetting();if(!notificationEnabled&&result.denied)toast('Allow notifications in Android settings to show lock screen controls.');window.syncNativeTracker();}
    catch {toast('Could not update notification settings.');}
  });
  let snapshotTimer;
  window.syncNativeTracker=(immediate=false)=>{
    clearTimeout(snapshotTimer);
    const sendSnapshot=()=>{
      if(document.body.classList.contains('auth-loading'))return;
      const entry=activeEntry(),now=Date.now();
      nativeTracker.update({title:entry?.title||'Ready for your next task',entryId:entry?.id||'',status:entry?(T.isPaused(entry)?'paused':'running'):'idle',elapsedMs:entry?T.elapsed(entry,now):0,snapshotAt:now,theme:document.body.dataset.theme}).catch(()=>{});
    };
    if(immediate)sendSnapshot();else snapshotTimer=setTimeout(sendSnapshot,80);
  };
  async function consumeWidgetAction(){
    if(actionBusy)return;actionBusy=true;
    try {
      await window.MoaAuth.ready;
      const request=await nativeTracker.consumeAction();
      if(!request.action)return;
      const current=activeEntry();
      $('settingsDialog').close();setView('dashboard');setDay(T.dayKey());
      if(request.action==='start'&&!current)toggleTracking();
      if(current&&request.entryId===current.id){
        if(request.action==='pause'&&!T.isPaused(current))togglePauseTracking();
        if(request.action==='resume'&&T.isPaused(current))togglePauseTracking();
        if(request.action==='stop')toggleTracking();
      }
    } finally {actionBusy=false;window.syncNativeTracker();}
  }
  nativeTracker.addListener('widgetAction',()=>consumeWidgetAction().catch(()=>{}));
  window.MoaAuth.ready.then(()=>{window.syncNativeTracker();return consumeWidgetAction();}).catch(()=>{});
  document.addEventListener('visibilitychange',()=>{window.syncNativeTracker(true);if(!document.hidden)consumeWidgetAction().catch(()=>{});});
}
