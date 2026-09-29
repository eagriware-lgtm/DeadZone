const $=s=>document.querySelector(s);
const modal=$('#modal'),modalTitle=$('#modalTitle'),modalText=$('#modalText');
function openModal(title,text){modalTitle.textContent=title;modalText.textContent=text;modal.classList.add('show');modal.setAttribute('aria-hidden','false')}
function closeModal(){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
$('#closeModal').addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
$('#playBtn').addEventListener('click',()=>$('#play').scrollIntoView());
$('#challengeBtn').addEventListener('click',()=>$('#challenges').scrollIntoView());
document.querySelectorAll('[data-action="start"]').forEach(b=>b.addEventListener('click',()=>openModal('The First Night','The five-wave challenge is queued. Next gameplay pass will connect this button to the 3D survival scene.')));
document.querySelector('[data-action="vehicle"]').addEventListener('click',()=>openModal('Vehicles','Vehicles are part of the DeadZone plan: approach, press E to enter, drive, exit, repair, and manage fuel.'));
$('#modalAction').addEventListener('click',closeModal);

let running=false,start=0,raf=0,best=Number(localStorage.getItem('deadzone-best-time')||0);
function fmt(ms){const s=ms/1000;return String(Math.floor(s/60)).padStart(2,'0')+':'+(s%60).toFixed(2).padStart(5,'0')}
function tick(){if(!running)return;$('#timer').textContent=fmt(performance.now()-start);raf=requestAnimationFrame(tick)}
if(best)$('#bestTime').textContent=fmt(best);
$('#runBtn').addEventListener('click',()=>{if(!running){running=true;start=performance.now();$('#runBtn').textContent='FINISH RUN';tick()}else{running=false;cancelAnimationFrame(raf);const t=performance.now()-start;if(!best||t<best){best=t;localStorage.setItem('deadzone-best-time',String(t));$('#bestTime').textContent=fmt(t)}$('#runBtn').textContent='START RUN'}});
$('#resetBtn').addEventListener('click',()=>{running=false;cancelAnimationFrame(raf);$('#timer').textContent='00:00.00';$('#runBtn').textContent='START RUN'});
