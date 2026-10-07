'use strict';
let calendarPage = new Date(`${selectedDay}T12:00:00`);
const monthNames = Array.from({length:12},(_,i)=>new Date(2026,i,1).toLocaleDateString('en-US',{month:'long'}));
function renderCalendar(focusDay) {
  if (!$('calendarDialog').open) return;
  const year = calendarPage.getFullYear(), month = calendarPage.getMonth();
  $('calendarMonth').innerHTML = monthNames.map((name,i)=>`<option value="${i}"${i===month?' selected':''}>${name}</option>`).join('');
  const earliest = Math.min(2020,year,...workspace().entries.map(e=>new Date(e.startedAt).getFullYear()).filter(Number.isFinite));
  const latest = Math.max(new Date().getFullYear()+5,year);
  $('calendarYear').innerHTML = Array.from({length:latest-earliest+1},(_,i)=>`<option${earliest+i===year?' selected':''}>${earliest+i}</option>`).join('');
  const first = new Date(year,month,1,12); first.setDate(1-first.getDay());
  const today = T.dayKey();
  $('calendarGrid').innerHTML = Array.from({length:42},(_,i)=>{
    const date = new Date(first); date.setDate(first.getDate()+i);
    const key = T.dayKey(date), marked = T.dailyEntries(workspace().entries,key).length>0;
    const selected = key===selectedDay;
    return `<button type="button" data-calendar-day="${key}" class="calendar-day${date.getMonth()!==month?' outside':''}${key===today?' today':''}${selected?' selected':''}" aria-label="${date.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}${marked?', time recorded':''}" aria-pressed="${selected}"${key===today?' aria-current="date"':''} tabindex="${key===(focusDay||selectedDay)?0:-1}"><span>${date.getDate()}</span>${marked?'<i class="recorded-dot" aria-hidden="true"></i>':''}</button>`;
  }).join('');
  if (!$('calendarGrid').querySelector('[tabindex="0"]')) $('calendarGrid').querySelector('.calendar-day:not(.outside)').tabIndex=0;
}
window.renderCalendar = renderCalendar;
document.addEventListener('click',event=>{
  const button=event.target.closest('button'); if(!button) return;
  if(button.hasAttribute('data-calendar')) {
    calendarPage=new Date(`${selectedDay}T12:00:00`); showDialog('calendarDialog'); renderCalendar();
    $('calendarGrid').querySelector('[tabindex="0"]').focus();
  }
  if(button.dataset.dayOffset) moveDay(Number(button.dataset.dayOffset));
  if(button.dataset.calendarDay) { setDay(button.dataset.calendarDay); $('calendarDialog').close(); }
});
function shiftMonth(offset) { calendarPage=new Date(calendarPage.getFullYear(),calendarPage.getMonth()+offset,1,12); renderCalendar(); }
$('calendarPrevious').addEventListener('click',()=>shiftMonth(-1));
$('calendarNext').addEventListener('click',()=>shiftMonth(1));
['calendarMonth','calendarYear'].forEach(id=>$(id).addEventListener('change',()=>{calendarPage=new Date(Number($('calendarYear').value),Number($('calendarMonth').value),1,12);renderCalendar();}));
$('calendarToday').addEventListener('click',()=>{setDay(T.dayKey());$('calendarDialog').close();});
$('calendarGrid').addEventListener('keydown',event=>{
  const day=event.target.dataset.calendarDay;
  if(!day) return;
  const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(!(event.key in offsets)) return;
  event.preventDefault(); const next=new Date(`${day}T12:00:00`); next.setDate(next.getDate()+offsets[event.key]);
  calendarPage=next; const key=T.dayKey(next); renderCalendar(key);
  $('calendarGrid').querySelector(`[data-calendar-day="${key}"]`).focus();
});

// Touch and mouse share a hold-to-reorder gesture. Movement before the hold
// scrolls the chip strip instead, preserving quick label selection.
const strip=$('quickLabels');
let labelGesture=null, suppressLabelClickUntil=0;
function saveLabelOrder(order) {
  if(commit(next=>{workspace(next).labelOrder=order;})) {renderLabels();toast('Label order saved.');}
}
function cancelLabelGesture() {
  if(!labelGesture) return;
  clearTimeout(labelGesture.timer); labelGesture.node?.classList.remove('reordering'); labelGesture=null;
}
strip.addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-label]');
  if(!button||event.button!==0) return;
  cancelLabelGesture();
  const gesture={id:event.pointerId,node:button.closest('.label-chip'),button,startX:event.clientX,startY:event.clientY,lastX:event.clientX,dragging:false,scrolling:false};
  labelGesture=gesture; button.setPointerCapture(event.pointerId);
  gesture.timer=setTimeout(()=>{
    if(labelGesture!==gesture) return;
    gesture.dragging=true; gesture.node.classList.add('reordering');
    suppressLabelClickUntil=Date.now()+1000;
    toast('Drag to reorder. Release to save.');
  },450);
});
strip.addEventListener('pointermove',event=>{
  const g=labelGesture;if(!g||g.id!==event.pointerId) return;
  if(!g.dragging) {
    if(Math.hypot(event.clientX-g.startX,event.clientY-g.startY)>8) {clearTimeout(g.timer);g.scrolling=true;}
    if(g.scrolling) {strip.scrollLeft+=g.lastX-event.clientX;suppressLabelClickUntil=Date.now()+500;}
    g.lastX=event.clientX;return;
  }
  event.preventDefault(); suppressLabelClickUntil=Date.now()+1000;
  const box=strip.getBoundingClientRect();
  if(event.clientX<box.left+40) strip.scrollLeft-=18;
  if(event.clientX>box.right-40) strip.scrollLeft+=18;
  const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest('.label-chip');
  if(hit&&hit!==g.node&&hit.parentElement===strip) {
    const movingForward=!!(g.node.compareDocumentPosition(hit)&Node.DOCUMENT_POSITION_FOLLOWING);
    strip.insertBefore(g.node,movingForward?hit.nextSibling:hit);
  }
});
strip.addEventListener('pointerup',event=>{
  const g=labelGesture;if(!g||g.id!==event.pointerId) return;
  const dragged=g.dragging;
  const order=[...strip.querySelectorAll('[data-label]')].map(button=>button.dataset.label);
  cancelLabelGesture();if(dragged) {suppressLabelClickUntil=Date.now()+500;saveLabelOrder(order);}
});
strip.addEventListener('pointercancel',()=>{cancelLabelGesture();renderLabels();});
strip.addEventListener('contextmenu',event=>{if(event.target.closest('[data-label]'))event.preventDefault();});
strip.addEventListener('click',event=>{if(Date.now()<suppressLabelClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
strip.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-label]');
  if(!button||!event.altKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();const order=availableLabels(), index=order.indexOf(button.dataset.label),to=index+(event.key==='ArrowLeft'?-1:1);
  if(to<0||to>=order.length)return;
  [order[index],order[to]]=[order[to],order[index]];saveLabelOrder(order);
  strip.querySelector(`[data-label="${CSS.escape(button.dataset.label)}"]`).focus();
});
strip.setAttribute('aria-description','Hold and drag a label to reorder. With a keyboard, use Alt and the left or right arrow key.');
