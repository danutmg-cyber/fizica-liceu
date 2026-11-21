(function(global){
  'use strict';
  const VERSION = '20261121-all3';
  function install(api){
    const {root,state,config} = api;
    const key = `fizica-draft-${config.id}:${VERSION}`;
    let restoring = false, timer = 0, cleared = false;
    const keys=Object.keys(state).filter(k=>!['completed','instruments','instrument','finalized','evaluation','reportPayload'].includes(k));
    function path(element){
      const panel = element.closest('[data-panel]');
      if (!panel) return null;
      let parts = [];
      while(element !== panel){
        const tag=element.tagName.toLowerCase();
        const siblings=Array.from(element.parentElement.children).filter(e=>e.tagName===element.tagName);
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(element)+1})`);
        element=element.parentElement;
      }
      return `[data-panel="${panel.dataset.panel}"]`+(parts.length?' > '+parts.join(' > '):'');
    }
    function nodes(){
      return Array.from(root.querySelectorAll('[data-panel], [data-panel] *')).filter(el=>el instanceof HTMLElement &&
        !el.closest('.spatial-view, .physics-symbol-toolbar') &&
        (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) ||
         Array.from(el.attributes).some(a=>a.name.startsWith('data-'))));
    }
    function snapshotUI(){
      return nodes().map(el=>{
        const item={path:path(el), hidden:el.hidden, className:el.className, style:el.getAttribute('style')};
        if(/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){
          item.value=el.value;item.checked=el.checked;item.disabled=el.disabled;
        } else if(el.tagName==='BUTTON') item.disabled=el.disabled;
        else if(!el.children.length && el.tagName!=='CANVAS') item.text=el.textContent;
        return item;
      });
    }
    function showWarning(){
      if(root.querySelector('[data-progress-warning]')) return;
      const p=document.createElement('p');p.dataset.progressWarning='';p.className='feedback warn';
      p.textContent='Progresul nu poate fi păstrat în acest browser. Evită reîncărcarea paginii înainte de descărcarea raportului.';
      root.querySelector('header').after(p);
    }
    function save(){
      clearTimeout(timer);
      if(restoring || cleared || !state.session || state.finalized || api.isBusy()) return;
      try{
        const saved={version:VERSION,completed:[...state.completed],ui:snapshotUI()};
        for(const name of keys) saved[name]=state[name];
        sessionStorage.setItem(key,JSON.stringify(saved));
      }catch(error){showWarning();}
    }
    function schedule(){clearTimeout(timer);timer=setTimeout(save,100);}
    function clear(){
      // Numai după scrierea confirmată a raportului final.
      try{sessionStorage.removeItem(key);}catch(_){}
      cleared=true;clearTimeout(timer);
    }
    function restore(){
      let saved;
      try{
        saved=JSON.parse(sessionStorage.getItem(key)||'null');
        if(!saved)return false;
        if(saved.version!==VERSION || !saved.session || !Array.isArray(saved.completed) ||
           !Array.isArray(saved.ui) || !Number.isInteger(saved.step) || saved.step<0 || saved.step>7 ||
           !/^X [A-D]$/.test(saved.session.studentClass)) throw Error('Progres incompatibil');
        const generated=api.generateSet(saved.session.studentClass,saved.session.catalogNumber);
        if(JSON.stringify(generated)!==JSON.stringify(saved.set)) throw Error('Set incompatibil');
      }catch(error){try{sessionStorage.removeItem(key);}catch(_){}return false;}
      restoring=true;
      for(const name of keys) if(saved[name]!==undefined) state[name]=saved[name];
      state.completed=new Set(saved.completed.filter(n=>Number.isInteger(n)&&n>=0&&n<=7));
      api.rebuild(saved);
      // Constructorii unor instrumente inițializează citirile; apoi reaplicăm starea salvată.
      for(const name of keys) if(saved[name]!==undefined) state[name]=saved[name];
      state.completed=new Set(saved.completed);
      for(const item of saved.ui){
        let el;try{el=root.querySelector(item.path);}catch(_){continue;}
        if(!(el instanceof HTMLElement) || !el.closest('[data-panel]')) continue;
        if('value' in item && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)){
          el.value=item.value;el.checked=Boolean(item.checked);
        }
        if('disabled' in item) el.disabled=Boolean(item.disabled);
        el.hidden=Boolean(item.hidden);el.className=item.className;
        if(item.style===null) el.removeAttribute('style');else if(item.style) el.setAttribute('style',item.style);
        if('text' in item && !el.children.length && el.tagName!=='CANVAS') el.textContent=item.text;
      }
      for(const [sel,text] of [['student',state.session.studentName],['class',`Clasa ${state.session.studentClass}`],
        ['catalog',`Nr. ${state.session.catalogNumber}`],['date',state.session.experimentDate]])
        root.querySelector(`[data-header-${sel}]`).textContent=text;
      root.querySelector('[data-monitoring-status]').textContent='activă';
      global.LAB_SESSION=JSON.parse(JSON.stringify(state.session));
      global.LAB_SAFETY_STATE=state.safety;
      document.dispatchEvent(new CustomEvent('laborator:identification-complete',{detail:global.LAB_SESSION}));
      api.showStep(saved.step);
      api.afterRestore?.();api.redraw?.();
      restoring=false;
      root.dispatchEvent(new CustomEvent('laborator:progress-restored'));
      return true;
    }
    root.addEventListener('input',schedule);
    root.addEventListener('change',schedule);
    root.addEventListener('click',schedule);
    root.addEventListener('laborator:instrument-reading',schedule);
    const observer=new MutationObserver(schedule);
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled','style']});
    window.addEventListener('pagehide',save);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});
    return {save,clear,restore};
  }
  global.Class10Progress=Object.freeze({install});
})(globalThis);

(function(global){
'use strict';
function textIssue(value,{formula=false,minChars=25,minWords=5}={}){
    const text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    if(!text) return 'Completează acest răspuns.';
    if(/([a-z])\1{5,}/.test(text) || /([^\s]{2,8})\1{4,}/.test(text))
        return 'Înlocuiește șirurile repetitive cu explicația sau calculul tău.';
    const words=text.match(/[a-z]+/g)||[];
    if(words.some(w=>w.length>35)) return 'Separă cuvintele și elimină șirurile fără sens.';
    const meaningful=words.filter(w=>w.length>=2), count=new Map();
    for(const word of meaningful) count.set(word,(count.get(word)||0)+1);
    if(!formula && meaningful.length>=5 && Math.max(...count.values())/meaningful.length>.55)
        return 'Nu repeta același cuvânt. Scrie explicația sau calculul tău.';
    // Respinge și repetarea acelorași grupuri de cuvinte.
    if(!formula && meaningful.length>=12){
        for(let width=2;width<=Math.min(12,Math.floor(meaningful.length/3));width++){
            const grams=new Map();
            for(let i=0;i<=meaningful.length-width;i++){
                const key=meaningful.slice(i,i+width).join(' ');grams.set(key,(grams.get(key)||0)+1);
            }
            if([...grams.values()].some(n=>n>=3 && n*width/meaningful.length>=.8))
                return 'Ai repetat același grup de cuvinte. Păstrează o singură explicație.';
        }
    }
    if(text.length<minChars) return formula?'Scrie pașii calculului, cu valorile și unitățile folosite.':'Scrie o propoziție scurtă care explică răspunsul.';
    if(formula){
        const numbers=text.match(/\d+(?:[.,]\d+)?/g)||[];
        if(numbers.length<2 || !/[=×*·/÷−+\-]/.test(text))
            return 'Include în calcul valorile tale numerice, operațiile și unitățile.';
    }else if(meaningful.length<minWords) return 'Explică răspunsul într-o propoziție, folosind cel puțin cinci cuvinte.';
    return '';
}

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const thermal=[['calorimeter','Capacitatea termică a calorimetrului'],['reading','Citirea și rezoluția instrumentelor'],['environment','Schimbul de căldură cu mediul'],['transfer','Transferul sau amestecarea'],['other','Altă sursă sau limitare']];
const electrical=[['reading','Citirea și rezoluția aparatelor'],['contact','Contactele și rezistența conductoarelor'],['heating','Încălzirea componentei'],['source','Variația tensiunii sursei'],['other','Altă sursă sau limitare']];
const schemas={
1:{fields:[['Temperatura de echilibru calculată','calculatedEquilibriumTemperature_C','°C',1],['Temperatura de echilibru măsurată','measuredEquilibriumTemperature_C','°C',1]],compare:[1,0],question:'Cum este temperatura măsurată față de cea calculată?',concept:'În ce sens se transferă căldura la amestecare?',choices:['De la apa caldă spre apa rece','De la apa rece spre apa caldă','Nu se transferă căldură'],hint:'Compară temperaturile inițiale ale celor două cantități de apă.',sources:thermal},
3:{fields:[['Temperatura medie de pe palierul de fierbere','experimentalBoilingTemperature_C','°C',1],['Viteza medie de încălzire înaintea palierului','meanHeatingRate_C_per_min','°C/min',2]],reference:100,question:'Cum este temperatura de pe palier față de 100 °C?',concept:'Ce observi în timpul fierberii la presiune aproximativ constantă?',choices:['Temperatura rămâne aproximativ constantă','Temperatura crește continuu','Apa nu mai primește energie'],hint:'Observă ultimele trei citiri; energia primită susține vaporizarea.',sources:[['pressure','Presiunea atmosferică'],['reading','Citirea și rezoluția termometrului'],['position','Poziția termometrului sau neuniformitatea temperaturii'],['purity','Puritatea apei'],['other','Altă sursă sau limitare']]},
4:{fields:[['Rezistența medie determinată','averageResistanceOhm','Ω',2],['Rezistența determinată din panta graficului','graphResistanceOhm','Ω',2]],referenceKey:'referenceResistanceOhm',question:'Cum este rezistența medie față de valoarea nominală?',concept:'Pentru rezistorul ohmic la temperatură aproximativ constantă:',choices:['Tensiunea este aproximativ proporțională cu intensitatea','Intensitatea rămâne constantă la orice tensiune','Panta graficului U=f(I) reprezintă puterea'],hint:'Revede perechile U–I și semnificația raportului U/I.',sources:electrical},
5:{fields:[['Puterea la ultima determinare','experimentalPowerW','W',3],['Abaterea relativă față de puterea nominală','relativeErrorPercent','%',2]],referenceKey:'nominalPowerW',question:'Cum este puterea experimentală la ultima determinare față de puterea nominală?',concept:'Cum ai determinat puterea electrică absorbită de bec?',choices:['Am înmulțit tensiunea cu intensitatea: P=U·I','Am împărțit tensiunea la intensitate','Am considerat puterea egală cu tensiunea'],hint:'Verifică relația de calcul a puterii și unitatea watt.',sources:electrical},
6:{fields:[['Rezistența medie din valorile efective','averageResistanceOhm','Ω',2],['Panta graficului Ief=f(Uef)','graphConductanceS','S',4]],referenceKey:'referenceResistanceOhm',question:'Cum este rezistența medie față de valoarea nominală?',concept:'Ce reprezintă panta graficului Ief=f(Uef) pentru elementul rezistiv?',choices:['Conductanța G=1/R','Rezistența R','Puterea electrică'],hint:'Panta este ΔIef/ΔUef, exprimată în A/V, adică siemens.',sources:electrical},
7:{fields:[['Raportul tensiunilor U₁/U₂ în configurația 1','configuration1.voltageRatio','1',3],['Raportul spirelor N₁/N₂ în configurația 1','configuration1.turnsRatio','1',3]],compare:[0,1],question:'Cum este raportul tensiunilor față de raportul spirelor, la precizia raportată?',concept:'Ce se poate verifica prin aceste măsurări în gol?',choices:['Relația dintre raportul tensiunilor și raportul spirelor','Randamentul transformatorului','Puterea debitată în sarcină'],hint:'Secundarul este în gol; nu ai măsurat puterile necesare determinării randamentului.',sources:[['reading','Citirea și rezoluția voltmetrelor'],['winding','Rezistența înfășurărilor'],['flux','Fluxul de dispersie și abaterea de la modelul ideal'],['source','Variația tensiunii sursei'],['other','Altă sursă sau limitare']]}
};
const get=(obj,key)=>key.split('.').reduce((o,k)=>o?.[k],obj);
function install(api){
 const {root,state,number,config}=api,schema=schemas[number];
 state._readingAttempts={};
 state._startedHeating=false;
 root.addEventListener('click',e=>{if(e.target.closest('[data-start-heating]'))state._startedHeating=true;},{capture:true});
 const q=sel=>root.querySelector(sel),form=q('[data-evaluation-form]');
 const message=name=>`<span class="calc-feedback" id="guided-error-${name}" data-guided-error="${name}"></span>`;
 const attr=name=>`data-guided="${name}" aria-describedby="guided-error-${name}"`;
 const select=(name,options)=>`<select ${attr(name)}><option value="">Alege răspunsul</option>${options.map(([v,t])=>`<option value="${escape(v)}">${escape(t)}</option>`).join('')}</select>${message(name)}`;
 q('[data-guided-conclusion]').innerHTML=`<fieldset class="guided-conclusion"><legend>Concluzia pe baza datelor tale</legend><p>Folosește rezultatele verificate în etapa de calcule. Poți scrie fără diacritice și poți folosi virgula sau punctul zecimal.</p><p data-guided-reference></p>${schema.fields.map(([label,,unit],i)=>`<label class="field">${escape(label)}<input type="text" inputmode="decimal" maxlength="40" ${attr('value'+i)}>${message('value'+i)}</label><label class="field">Unitatea${select('unit'+i,[[unit,unit==='1'?'Fără unitate (raport adimensional)':unit],['wrong',unit==='Ω'?'W':'J'],['wrong2','kg']])}</label>`).join('')}<label class="field">${schema.question}${select('comparison',[['lower','Mai mică / mai mic'],['equal','Egală / egal la precizia raportată'],['higher','Mai mare']])}</label><label class="field">${schema.concept}${select('concept',schema.choices.map((t,i)=>[String(i),t]))}</label><label class="field">Ce arată rezultatele tale și care sunt limitele metodei?<textarea rows="4" maxlength="2000" ${attr('explanation')}></textarea>${message('explanation')}</label></fieldset><fieldset class="guided-conclusion"><legend>Două surse de eroare sau limitări diferite</legend>${[1,2].map(i=>`<label class="field">Sursa ${i}${select('source'+i,schema.sources)}</label><label class="field">Cum poate influența această sursă măsurarea sau rezultatul?<textarea rows="3" maxlength="1500" ${attr('effect'+i)}></textarea>${message('effect'+i)}</label>`).join('')}</fieldset><p data-guided-feedback class="feedback" role="status" aria-live="polite"></p>`;
 const style=document.createElement('style');style.textContent=`.guided-conclusion{min-width:0;margin:1rem 0;padding:1rem;border:1px solid #829aaa;border-radius:10px}.guided-conclusion legend{font-weight:700;padding:0 .4rem}.guided-conclusion .field{min-width:0;margin:.8rem 0}.guided-conclusion select{width:100%;max-width:100%;box-sizing:border-box;padding:.7rem;border:2px solid #829aaa;border-radius:8px;background:white;font:inherit;color:#17324d}.guided-conclusion .calc-feedback:empty{display:none}[aria-invalid=true]{border-color:#b42318!important}.step-tab.is-active.is-done{background:#126e82;color:white}.experiment-panel,fieldset{min-width:0}.report-status{overflow-wrap:anywhere}[data-evaluation-details]{max-width:100%;overflow-x:auto}[data-measurement-summary],[data-calculation-data],[data-analysis-data],.table-wrap{max-width:100%;overflow-x:auto}`;document.head.append(style);
 function values(){const c=state.notebook?.calculations;if(!c)return null;const v=schema.fields.map(([,key])=>Number(get(c,key)));const pair=schema.compare?schema.compare.map(i=>v[i]):[v[0],Number(schema.referenceKey?c[schema.referenceKey]:schema.reference)];const decimals=schema.fields[0][3],rounded=pair.map(n=>Number(n.toFixed(decimals)));return{v,pair,comparison:rounded[0]===rounded[1]?'equal':rounded[0]<rounded[1]?'lower':'higher'};}
 function updateReference(){const expected=values();q('[data-guided-reference]').textContent=expected?`Valoarea de comparație: ${expected.pair[1]} ${schema.fields[0][2]==='1'?'(adimensional)':schema.fields[0][2]}.`:'';}
 function validate(){
  const expected=values();if(!expected)return null;
  const data=Object.fromEntries(Array.from(form.querySelectorAll('[data-guided]')).map(el=>[el.dataset.guided,el.value.trim()]));let first=null;
  function error(name,text){const field=form.querySelector(`[data-guided="${name}"]`),output=form.querySelector(`[data-guided-error="${name}"]`);field.setAttribute('aria-invalid',String(Boolean(text)));output.textContent=text;output.className=text?'calc-feedback bad':'calc-feedback';if(text&&!first)first=field;}
  schema.fields.forEach(([,key,unit,decimals],i)=>{const value=global.PhysicsInput.parseNumber(data['value'+i]);error('value'+i,Number.isFinite(value)&&Math.abs(value-expected.v[i])<=.51*Math.pow(10,-decimals)?'':'Folosește rezultatul verificat în etapa de calcule, cu precizia indicată acolo.');error('unit'+i,data['unit'+i]===unit?'':'Verifică unitatea mărimii.');});
  error('comparison',data.comparison===expected.comparison?'':'Compară rezultatul tău cu valoarea de comparație, la precizia raportată.');error('concept',data.concept==='0'?'':schema.hint);error('explanation',textIssue(data.explanation));
  for(const i of[1,2]){error('source'+i,schema.sources.some(([v])=>v===data['source'+i])?'':'Alege o sursă sau o limitare.');error('effect'+i,textIssue(data['effect'+i]));}
  if(data.source1&&data.source1===data.source2)error('source2','Alege o a doua sursă diferită de prima.');
  const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(data.effect1&&norm(data.effect1)===norm(data.effect2))error('effect2','Explică separat efectul celei de-a doua surse.');
  const feedback=q('[data-guided-feedback]');feedback.textContent=first?'Revizuiește câmpurile marcate înainte de finalizare.':'';feedback.className=first?'feedback bad':'feedback';
  if(first){first.focus();first.scrollIntoView({block:'center',behavior:'smooth'});return null;}
  const comparisonText={lower:'mai mic(ă)',equal:'egal(ă) la precizia raportată',higher:'mai mare'};
  return{answers:data,individualValues:expected.v,referenceValue:expected.pair[1],conclusion:schema.fields.map(([label,,unit],i)=>`${label}: ${data['value'+i]} ${unit==='1'?'(adimensional)':unit}.`).join(' ')+` Comparație: ${comparisonText[data.comparison]}. ${schema.choices[Number(data.concept)]}. Explicația elevului: ${data.explanation}`,errorSources:[1,2].map(i=>`${i}. ${schema.sources.find(([v])=>v===data['source'+i])[1]}: ${data['effect'+i]}`).join('\n')};
 }
 root.addEventListener('input',event=>{const name=event.target.dataset.guided;if(!name)return;event.target.removeAttribute('aria-invalid');const output=q(`[data-guided-error="${name}"]`);output.textContent='';output.className='calc-feedback';});
 // Tentativele acumulate sunt independente de instanța vizuală recreată.
 const original=global.LaboratorInstrumente;
 if(number!==1)global.LaboratorInstrumente={...original,afiseaza(options){const baseline=state._readingAttempts[options.id]||0;const instance=original.afiseaza(options);const container=typeof options.target==='string'?document.querySelector(options.target):options.target;
 container.addEventListener('laborator:instrument-reading',event=>{if(Number.isFinite(event.detail?.attempts)){event.detail.attempts+=baseline;state._readingAttempts[options.id]=event.detail.attempts;}},true);return instance;}};
 const progress=global.Class10Progress.install({...api,afterRestore:updateReference});
 const observer=new MutationObserver(updateReference);observer.observe(q('[data-panel="7"]'),{attributes:true,attributeFilter:['hidden']});
 // Alte completări libere din experimentul 1 primesc aceeași verificare de bază.
 q('[data-check-analysis]').addEventListener('click',()=>{for(const el of root.querySelectorAll('[data-correction-reflection],[data-independent-application]')){const issue=textIssue(el.value);if(issue){api.invalidateAnalysis();el.setAttribute('aria-invalid','true');q('[data-feedback="calculation"]').textContent=issue;}}});
 return{...progress,validate,values,schema};
}
global.Class10Upgrade=Object.freeze({install,textIssue});
})(globalThis);
