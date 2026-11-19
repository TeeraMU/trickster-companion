(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stats = ['AP','AC','DX','MP','MA','MD','WT','DA','LK','HP','DP','HV'];
  const elements = ['Fire','Water','Wind','Earth','Elec','Light','Dark'];
  const modifiers = [...stats,...elements.map(x=>`${x}%`)];
  const slots = [
    {key:'weapon', type:'weapon', label:'อาวุธ', icon:'⚔'}, {key:'hat',type:'hat',label:'หมวก',icon:'♜'},
    {key:'shield',type:'shield',label:'โล่',icon:'◇'}, {key:'pet',type:'pet',label:'สัตว์เลี้ยง',icon:'♧'},
    {key:'acc1',type:'accessory',label:'เครื่องประดับ 1',icon:'✧'}, {key:'acc2',type:'accessory',label:'เครื่องประดับ 2',icon:'✧'},
    {key:'ear',type:'ear',label:'หู',icon:'♬'}, {key:'tail',type:'tail',label:'หาง',icon:'❧'}, {key:'innerwear',type:'innerwear',label:'เสื้อชั้นใน',icon:'♧'},
    {key:'cape',type:'cape',label:'ผ้าคลุม',icon:'♢'},
    {key:'fashion1',type:'fashion',label:'Fashion 1',icon:'✿'}, {key:'fashion2',type:'fashion',label:'Fashion 2',icon:'❀'}
  ];
  const groups = ['Power','Magic','Sense','Charm'];
  const assets = await Promise.all([fetch('../data/builds.json').then(r => {if(!r.ok)throw Error('build data');return r.json()}),fetch('equipment.json').then(r => {if(!r.ok)throw Error('equipment data');return r.json()})]).catch(() => { $('.notice').innerHTML = '<strong>โหลดข้อมูลไม่สำเร็จ กรุณาเปิดเดโมผ่าน local server</strong>'; return [null,[]]; });
  const [builds, catalog] = assets;
  if (!builds) return;
  const starter = () => ({character:'Cat',job:'Entertainer',level:150,growth:{Power:1,Magic:1,Sense:4,Charm:4},equipped:{},custom:[]});
  const key='tc_planner_demo_v1'; let state;
  try { state=JSON.parse(localStorage.getItem(key)) || starter(); } catch { state=starter(); }
  state = {...starter(),...state}; state.growth = {...starter().growth,...state.growth}; state.equipped ||= {}; state.custom ||= [];
  // Preserve the previous demo's single manual bonus as a separate refinement adjustment.
  for (const cfg of Object.values(state.equipped)) {
    cfg.refine ||= {level:0, stat:cfg.bonusStat || 'AP', value:cfg.bonusValue || 0};
    cfg.compoundCount = Math.max(0, Math.min(6, Math.floor(Number(cfg.compoundCount) || 0)));
    cfg.compounds = Array.isArray(cfg.compounds) ? cfg.compounds : [];
    delete cfg.bonusStat; delete cfg.bonusValue;
  }
  let selectedSlot = '';
  const byId = id => [...state.custom,...catalog].find(x => x.id===id);
  function number(v){return Number.isFinite(Number(v)) ? Number(v) : 0;}
  function format(n){return Number.isInteger(n) ? n.toLocaleString() : Number(n.toFixed(2)).toLocaleString();}
  function selectors(){
    $('#character').innerHTML=Object.keys(builds.classes).map(c=>`<option ${c===state.character?'selected':''}>${escape(c)}</option>`).join('');
    const jobs=builds.classes[state.character]?.jobs || [];
    if (!jobs.some(j=>j.name===state.job)) state.job=jobs[0]?.name || '';
    $('#job').innerHTML=jobs.map(j=>`<option ${j.name===state.job?'selected':''}>${escape(j.name)}</option>`).join('');
    $('#level').value=state.level;
    $('#custom-slot').innerHTML=[...new Map(slots.map(s=>[s.type,s])).values()].map(s=>`<option value="${s.type}">${escape(s.label.replace(/ [12]$/,''))}</option>`).join('');
  }
  function renderGrowth(){
    const total=groups.reduce((n,g)=>n+number(state.growth[g]),0);
    $('#growth-total').textContent=`${total} / 10`;
    $('#growth-total').classList.toggle('invalid',total!==10);
    $('#growth').innerHTML=groups.map(g=>`<div class="growth-item"><small>${g}</small><strong>${state.growth[g]}</strong><div class="growth-controls"><button data-growth="${g}" data-delta="-1" ${state.growth[g]<=1?'disabled':''} aria-label="ลด ${g}">−</button><button data-growth="${g}" data-delta="1" ${state.growth[g]>=4||total>=10?'disabled':''} aria-label="เพิ่ม ${g}">+</button></div></div>`).join('');
  }
  function renderSlots(){
    $('#equipped-count').textContent=slots.filter(s=>byId(state.equipped[s.key]?.id)).length;
    $('#slot-count').textContent=slots.length;
    const iconSlot = k => {const s=slots.find(x=>x.key===k), item=byId(state.equipped[k]?.id);return `<button class="gear-slot ${item?'is-equipped':''}" data-pick="${k}" title="${escape(s.label)}${item?' · '+escape(item.name):' · เลือกอุปกรณ์'}" aria-label="${escape(s.label)}: ${item?escape(item.name):'เลือกอุปกรณ์'}"><span class="gear-icon">${s.icon}</span><small>${escape(s.label)}</small>${item?`<span class="gear-item-name">${escape(item.name)}</span><i></i>`:''}</button>`;};
    const job=builds.classes[state.character]?.jobs.find(j=>j.name===state.job);
    $('#gear-map').innerHTML=`<div class="gear-window-head"><span>✦</span> EQUIPMENT <small>ตัวอย่างการจัดช่อง</small></div><div class="gear-body"><div class="gear-column">${['hat','weapon','acc1','innerwear','pet'].map(iconSlot).join('')}</div><div class="gear-avatar"><span class="gear-sparkle">✧</span>${job?.art?`<img src="${escape(job.art)}" alt="${escape(state.job)}" onerror="this.hidden=true">`:''}<div class="gear-avatar-label">${escape(state.character)}<small>${escape(state.job)}</small></div></div><div class="gear-column gear-column-right">${['ear','shield','acc2','tail','cape'].map(iconSlot).join('')}</div></div><div class="fashion-bar"><div class="fashion-heading"><span>FASHION</span><small>2 ช่องที่รวมสเตตัส</small></div><div class="fashion-slots">${['fashion1','fashion2'].map(iconSlot).join('')}</div></div>`;
    $('#slots').innerHTML=slots.map(s=>{const config=state.equipped[s.key], item=byId(config?.id);if(!item)return `<div class="slot"><div class="slot-top"><div class="slot-icon">${s.icon}</div><div class="slot-info"><small>${escape(s.label)}</small><button class="empty" data-pick="${s.key}">+ เลือกอุปกรณ์</button></div></div></div>`;
      config.refine ||= {level:0,stat:'AP',value:0}; config.compounds ||= []; const count=number(config.compoundCount);
      const choices=(value)=>modifiers.map(st=>`<option ${st===value?'selected':''}>${st}</option>`).join('');
      const compounds=Array.from({length:count},(_,i)=>{const c=config.compounds[i]||{};return `<div class="compound-row"><span class="compound-index">${i+1}</span><input data-compound-name="${s.key}" data-index="${i}" value="${escape(c.name||'')}" placeholder="ชื่อของที่ผสม" aria-label="${escape(s.label)} ช่อง ${i+1} ของที่ผสม"><select data-compound-stat="${s.key}" data-index="${i}" aria-label="${escape(s.label)} ช่อง ${i+1} สเตตัส">${choices(c.stat||'AP')}</select><input data-compound-value="${s.key}" data-index="${i}" type="number" step="any" value="${number(c.value)}" aria-label="${escape(s.label)} ช่อง ${i+1} ค่าสเตตัส"></div>`}).join('');
      return `<div class="slot"><div class="slot-top"><div class="slot-icon">${s.icon}</div><div class="slot-info"><small>${escape(s.label)}</small><button data-pick="${s.key}">${escape(item.name)}</button></div><button class="slot-remove" data-remove="${s.key}" aria-label="นำ ${escape(s.label)} ออก">×</button></div><div class="slot-meta">Lv.${item.level} · ${item.source==='custom'?'เพิ่มเอง':'ข้อมูลเกมเดิม'}</div><details class="item-options"><summary>ปรับแต่งไอเทม <span>+${number(config.refine.level)} · Compound ${count} ช่อง</span></summary><div class="option-block"><div class="option-title">ตีบวก (Refine)</div><div class="refine-grid"><label>ระดับ +<input data-refine-level="${s.key}" type="number" min="0" max="99" value="${number(config.refine.level)}" aria-label="${escape(s.label)} ระดับตีบวก"></label><label>สเตตัส<select data-refine-stat="${s.key}" aria-label="${escape(s.label)} สเตตัสตีบวก">${choices(config.refine.stat||'AP')}</select></label><label>ค่าเพิ่ม<input data-refine-value="${s.key}" type="number" step="any" value="${number(config.refine.value)}" aria-label="${escape(s.label)} ค่าเพิ่มจากตีบวก"></label></div><p>กรอกค่าเพิ่มจากเกมเอง ระดับตีบวกยังไม่คำนวณให้อัตโนมัติ</p></div><div class="option-block"><div class="compound-head"><span class="option-title">Compound</span><label>จำนวนช่อง <select data-compound-count="${s.key}" aria-label="${escape(s.label)} จำนวนช่อง Compound">${Array.from({length:7},(_,i)=>`<option value="${i}" ${i===count?'selected':''}>${i} ช่อง</option>`).join('')}</select></label></div>${compounds||'<p>เลือกจำนวนช่องเพื่อใส่ของที่ผสม</p>'}<p>แต่ละช่องเลือกสเตตัสและระบุค่าที่ได้จากเกม</p></div></details></div>`}).join('');
  }
  function renderStats(){
    $('#profile-name').textContent=`${state.character} · ${state.job}`;
    $('#profile-level').textContent=`LEVEL ${state.level}`;
    const gains=TQBuild.statPlan(builds.stats,{level:state.level,growth:state.growth,bonus:{}});
    const itemSum=Object.fromEntries(stats.map(s=>[s,0]));
    for(const config of Object.values(state.equipped)){const item=byId(config.id);if(!item)continue;for(const [k,v] of Object.entries(item.stats||{}))if(k in itemSum)itemSum[k]+=number(v);const r=config.refine||{};if(r.stat in itemSum)itemSum[r.stat]+=number(r.value);for(const c of (config.compounds||[]).slice(0,number(config.compoundCount)))if(c?.stat in itemSum)itemSum[c.stat]+=number(c.value);}
    // Display an integer estimate only: the live server's rounding and initial stats are not verified.
    const buffs=Array.isArray(state.buffs)?state.buffs:(state.buff?[state.buff]:[]);
    $('#stats').innerHTML=stats.map(s=>{const growth=gains.find(x=>x.stat===s)?.gain||0,bonus=itemSum[s],signed=bonus>=0?`+${format(bonus)}`:format(bonus),buff=buffs.filter(b=>b.enabled&&b.stat===s).reduce((n,b)=>n+number(b.value),0);return `<div class="stat"><small>${s}</small><strong>${format(Math.trunc(growth))} <em class="item-bonus">(${signed})</em></strong><span>Growth · ไอเทม${buff?` · บัฟ ${buff>0?'+':''}${format(buff)}`:''}</span></div>`}).join('');
    window.dispatchEvent(new Event('planner-demo-change'));
  }
  function render(){selectors();renderGrowth();renderSlots();renderStats();}
  function showResults(){
    const slot=slots.find(s=>s.key===selectedSlot); if(!slot)return;
    const query=$('#search').value.trim().toLocaleLowerCase();
    const found=[...state.custom,...catalog].filter(x=>x.slot===slot.type&&x.name.toLocaleLowerCase().includes(query));
    $('#results-count').textContent=`พบ ${found.length.toLocaleString()} รายการ · แสดงสูงสุด 60 รายการ`;
    const current=byId(state.equipped[selectedSlot]?.id);
    $('#results').innerHTML=found.slice(0,60).map(x=>{const changes=[...new Set([...Object.keys(current?.stats||{}),...Object.keys(x.stats||{})])].map(k=>[k,number(x.stats[k])-number(current?.stats?.[k])]).filter(([,v])=>v!==0);return `<button class="result" data-item="${escape(x.id)}"><div><strong>${escape(x.name)}</strong><small>Lv.${x.level} · ${x.source==='custom'?'เพิ่มเอง':'ข้อมูลเกมเดิม'} · ${escape(Object.entries(x.stats).map(([k,v])=>`${k} ${v>0?'+':''}${v}`).join('  ')||'ไม่มีสเตตัสที่บันทึก')}</small><span class="hover-compare">เทียบ ${escape(current?.name||'ช่องว่าง')}: ${changes.length?changes.map(([k,v])=>`${escape(k)} ${v>0?'+':''}${format(v)}`).join(' · '):'ค่าเท่ากัน'} <em>เฉพาะค่าพื้นฐาน</em></span></div><span>＋</span></button>`}).join('') || '<p class="modal-hint">ไม่พบไอเทม ลองค้นชื่ออื่นหรือเพิ่มไอเทม custom</p>';
  }
  $('#character').addEventListener('change',e=>{state.character=e.target.value;state.job='';render()});
  $('#job').addEventListener('change',e=>{state.job=e.target.value;renderSlots();renderStats()});
  $('#level').addEventListener('change',e=>{state.level=Math.max(1,Math.min(999,Math.floor(number(e.target.value)||1)));render()});
  $('#growth').addEventListener('click',e=>{const b=e.target.closest('[data-growth]');if(!b)return;state.growth=TQBuild.stepGrowth(state.growth,b.dataset.growth,number(b.dataset.delta));renderGrowth();renderStats()});
  function openPicker(slotKey){selectedSlot=slotKey;$('#picker-title').textContent=`เลือก${slots.find(x=>x.key===selectedSlot).label}`;$('#search').value='';showResults();$('#picker').showModal();$('#search').focus()}
  $('#gear-map').addEventListener('click',e=>{const pick=e.target.closest('[data-pick]');if(pick)openPicker(pick.dataset.pick)});
  $('#slots').addEventListener('click',e=>{const pick=e.target.closest('[data-pick]'),remove=e.target.closest('[data-remove]');if(pick)openPicker(pick.dataset.pick);if(remove){delete state.equipped[remove.dataset.remove];renderSlots();renderStats()}});
  function updateSlotOption(e){const d=e.target.dataset, k=d.refineLevel||d.refineStat||d.refineValue||d.compoundCount||d.compoundName||d.compoundStat||d.compoundValue;if(!k)return;const cfg=state.equipped[k];cfg.refine ||= {level:0,stat:'AP',value:0};cfg.compounds ||= [];
    if(d.refineLevel)cfg.refine.level=Math.max(0,Math.min(99,Math.floor(number(e.target.value))));
    else if(d.refineStat)cfg.refine.stat=e.target.value;
    else if(d.refineValue)cfg.refine.value=number(e.target.value);
    else if(d.compoundCount){cfg.compoundCount=Math.max(0,Math.min(6,Math.floor(number(e.target.value))));renderSlots();const detail=$(`#slots [data-compound-count="${k}"]`)?.closest('details');if(detail)detail.open=true;}
    else {const i=Number(d.index);cfg.compounds[i] ||= {name:'',stat:'AP',value:0};if(d.compoundName)cfg.compounds[i].name=e.target.value;else if(d.compoundStat)cfg.compounds[i].stat=e.target.value;else if(d.compoundValue)cfg.compounds[i].value=number(e.target.value);}
    renderStats();
    const summary=e.target.closest('details')?.querySelector('summary span');if(summary)summary.textContent=`+${number(cfg.refine.level)} · Compound ${number(cfg.compoundCount)} ช่อง`;
  }
  $('#slots').addEventListener('change',updateSlotOption);
  $('#slots').addEventListener('input',e=>{if(e.target.tagName==='INPUT')updateSlotOption(e)});
  $('#search').addEventListener('input',showResults);
  $('#results').addEventListener('click',e=>{const b=e.target.closest('[data-item]');if(!b)return;state.equipped[selectedSlot]={id:b.dataset.item,refine:{level:0,stat:'AP',value:0},compoundCount:0,compounds:[]};$('#picker').close();renderSlots();renderStats()});
  $('#add-custom').addEventListener('click',()=>{$('#custom-form').reset();$('#custom').showModal()});
  $('#custom-stats').innerHTML=modifiers.map(s=>`<label>${s}<input type="number" name="${s}" value="0" step="any"></label>`).join('');
  $('#custom-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target),name=String(f.get('name')).trim();if(!name)return;const item={id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,slot:String(f.get('slot')),level:Math.max(0,number(f.get('level'))),source:'custom',stats:Object.fromEntries(modifiers.map(s=>[s,number(f.get(s))]).filter(([,v])=>v))};state.custom.push(item);const target=slots.find(s=>s.type===item.slot&&!state.equipped[s.key]);if(target)state.equipped[target.key]={id:item.id,refine:{level:0,stat:'AP',value:0},compoundCount:0,compounds:[]};$('#custom').close();render();});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).close()));
  $('#save').addEventListener('click',()=>{try{localStorage.setItem(key,JSON.stringify(state));$('#save').textContent='✓ บันทึกแล้ว';setTimeout(()=>$('#save').textContent='♡ บันทึกบิลด์',1800)}catch{$('#save').textContent='บันทึกไม่สำเร็จ'}});
  $('#reset').addEventListener('click',()=>{state=starter();render()});
  function getElements(){const result=Object.fromEntries(elements.map(k=>[k,0]));for(const cfg of Object.values(state.equipped)){const item=byId(cfg.id);if(!item)continue;for(const k of elements){result[k]+=number(item.elements?.[k])+number(item.stats?.[`${k}%`]);if(cfg.refine?.stat===`${k}%`)result[k]+=number(cfg.refine.value);for(const c of (cfg.compounds||[]).slice(0,number(cfg.compoundCount)))if(c?.stat===`${k}%`)result[k]+=number(c.value);}}for(const b of state.buffs||[])if(b.enabled)for(const k of elements)if(b.stat===`${k}%`)result[k]+=number(b.value);return result;}
  const lab=document.querySelector('.lab'),aside=document.querySelector('aside'),compare=document.querySelector('.compare-card');if(lab&&aside&&compare)aside.insertBefore(lab,compare);
  window.PlannerDemo={getState:()=>state,getCatalog:()=>catalog,getBuilds:()=>builds,getSlots:()=>slots,getElements,renderStats};
  render();window.dispatchEvent(new Event('planner-demo-ready'));
})();
