'use strict';
if (window.Capacitor?.isNativePlatform()) {
  document.documentElement.classList.add('native-app');
  const ios = window.Capacitor.getPlatform?.() === 'ios';
  const nativeTracker = window.Capacitor.Plugins.MoaTracker;
  const section = document.createElement('section');
  section.className='settings-section widget-settings';
  section.innerHTML=ios
    ? '<h3>Widgets & lock screen</h3><p>Start, pause or stop without opening moa on iOS 17 or later. Add task details later in the app.</p><button type="button" id="pinTrackerWidget" class="secondary">How to add a widget</button><p>Home Screen: touch and hold an empty area, choose Edit → Add Widget, then search for moa.</p><p>Lock Screen: touch and hold the screen, choose Customize → Lock Screen → Add Widgets, then moa.</p>'
    : '<h3>Widgets & lock screen</h3><p>Start, pause or stop right from your home screen. Add task details later in moa.</p><div class="widget-size-options"><button type="button" id="pinTrackerWidget" class="secondary">Add 1 × 4 widget</button><button type="button" id="pinTrackerWidgetTall" class="secondary">Add 2 × 4 widget</button></div><button type="button" id="lockTrackerToggle" class="secondary" aria-pressed="false">Enable lock screen controls</button><p>On Galaxy, allow moa notifications on the Lock screen in phone Settings. Cover-screen and lock-screen widget placement depends on your phone and One UI version.</p>';
  $('settingsDialog').insertBefore(section,$('settingsDialog').querySelector('.settings-brand'));
  let notificationEnabled=false, actionBusy=false;
  function paintNotificationSetting(){const b=$('lockTrackerToggle');b.textContent=notificationEnabled?'Disable lock screen controls':'Enable lock screen controls';b.setAttribute('aria-pressed',String(notificationEnabled));}
  if(!ios)nativeTracker.getSettings().then(result=>{notificationEnabled=result.notifications;paintNotificationSetting();}).catch(()=>{});
  $('pinTrackerWidget').addEventListener('click',async()=>{
    if(ios){toast('Touch and hold the Home or Lock Screen, choose Add Widgets, then search for moa.');return;}
    try {const result=await nativeTracker.pinWidget({size:'1x4'});if(!result.supported)toast('Long-press your home screen, choose Widgets, then moa.');}
    catch {toast('Long-press your home screen, choose Widgets, then moa.');}
  });
  $('pinTrackerWidgetTall')?.addEventListener('click',async()=>{
    try {const result=await nativeTracker.pinWidget({size:'2x4'});if(!result.supported)toast('Long-press your home screen, choose Widgets, then moa.');}
    catch {toast('Long-press your home screen, choose Widgets, then moa.');}
  });
  $('lockTrackerToggle')?.addEventListener('click',async()=>{
    try {const result=await nativeTracker.setNotifications({enabled:!notificationEnabled});notificationEnabled=result.enabled;paintNotificationSetting();if(!notificationEnabled&&result.denied)toast('Allow notifications in Android settings to show lock screen controls.');window.syncNativeTracker();}
    catch {toast('Could not update notification settings.');}
  });
  let snapshotTimer, syncing=false, queued=false, restoring=false, revision=-1;
  const backgroundControls=typeof nativeTracker.getSnapshot==='function';
  function mergeWidgetRecords(result){
    revision=result.revision;
    if(!result.pending?.length)return;
    window.nativeTrackerReady=false;
    if(storageBroken)throw new Error('Device records could not be read.');
    const next=readState();
    if((next.nativeWidgetRevision??-1)<revision){
      for(const change of result.pending){
        const ws=next.workspaces[change.owner];
        if(!ws||!change.entry?.id)throw new Error('Could not restore the widget workspace.');
        const index=ws.entries.findIndex(e=>e.id===change.entry.id);
        if(index<0)ws.entries.push(change.entry);else ws.entries[index]=change.entry;
        if(change.draft)ws.draft=change.draft;
      }
      next.nativeWidgetRevision=revision;
      localStorage.setItem(STORE,JSON.stringify(next));
    }
    state=next;
    restoring=true;
    try {loadFields();render();} finally {restoring=false;}
  }
  async function synchronize(){
    if(syncing){queued=true;return;}syncing=true;
    try {
      do {
        queued=false;
        if(document.body.classList.contains('auth-loading'))return;
        if(backgroundControls)mergeWidgetRecords(await nativeTracker.getSnapshot());
        let accepted=false;
        for(let attempt=0;attempt<5&&!accepted;attempt++){
          const entry=activeEntry(),now=Date.now();
          const result=await nativeTracker.update({title:entry?.title||'moa',entryId:entry?.id||'',status:entry?(T.isPaused(entry)?'paused':'running'):'idle',elapsedMs:entry?T.elapsed(entry,now):0,snapshotAt:now,theme:document.body.dataset.theme,
            revision,owner:state.session||'guest',entry:entry?structuredClone(entry):null,draft:structuredClone(workspace().draft)});
          if(!backgroundControls){accepted=true;break;}
          if(result.accepted){revision=result.revision;accepted=true;}
          else mergeWidgetRecords(result);
        }
        if(!accepted)throw new Error('Widget records changed. Please try again.');
        window.nativeTrackerReady=true;
      } while(queued);
    } catch(error){
      window.nativeTrackerReady=false;
      toast('Could not sync widget records. Your saved records are safe. Reopen moa to try again.');
    } finally {syncing=false;}
  }
  window.syncNativeTracker=(immediate=false)=>{
    if(restoring)return;
    clearTimeout(snapshotTimer);
    if(immediate)synchronize();else snapshotTimer=setTimeout(synchronize,80);
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
  if(backgroundControls)nativeTracker.addListener('trackerChanged',()=>{window.nativeTrackerReady=false;window.syncNativeTracker(true);});
  window.MoaAuth.ready.then(()=>{if(backgroundControls)window.nativeTrackerReady=false;window.syncNativeTracker(true);return consumeWidgetAction();}).catch(()=>{});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&backgroundControls)window.nativeTrackerReady=false;
    window.syncNativeTracker(true);if(!document.hidden)consumeWidgetAction().catch(()=>{});
  });
  // iOS widget intents run in another process, so check its durable journal
  // while the app is visible as well as whenever it resumes.
  if(backgroundControls)setInterval(()=>{if(!document.hidden)window.syncNativeTracker(true);},2000);
}
