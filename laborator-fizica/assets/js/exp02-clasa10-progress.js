(function(global){
  'use strict';
  const VERSION = '20261121-guided2';
  function install(api){
    const {root,state,config} = api;
    const key = `fizica-draft-${config.id}:${VERSION}`;
    const oldKey = `fizica-draft-${config.id}:20261121-32`;
    let restoring = false, timer = 0, cleared = false;
    const keys = ['step','session','set','safety','equipment','predictions','measurements',
      'heating','mixing','activity','calculationVerified','analysisVerified','notebook',
      'readingAttempts','balanceAttempts'];
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
      return Array.from(root.querySelectorAll('[data-panel], [data-panel] *')).filter(el=>
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
      try{sessionStorage.removeItem(oldKey);}catch(_){}
      cleared=true;clearTimeout(timer);
    }
    function restore(){
      let saved, migrated=false;
      try{
        saved=JSON.parse(sessionStorage.getItem(key)||'null');
        if(!saved){saved=JSON.parse(sessionStorage.getItem(oldKey)||'null');migrated=Boolean(saved);}
        if(!saved) return false;
        if(migrated && saved.version==='20261121-32'){
          saved.version=VERSION;
          saved.ui=saved.ui.filter(item=>!item.path.startsWith('[data-panel="7"]'));
          saved.step=Math.min(saved.step,6);
          saved.completed=saved.completed.filter(n=>n<6);
          saved.analysisVerified=false;saved.notebook=null;
        }
        if(saved.version!==VERSION || !saved.session || !Array.isArray(saved.completed) ||
           !Array.isArray(saved.ui) || !Number.isInteger(saved.step) || saved.step<0 || saved.step>7 ||
           !/^X [A-D]$/.test(saved.session.studentClass)) throw Error('Progres incompatibil');
        const generated=api.generateSet(saved.session.studentClass,saved.session.catalogNumber);
        if(JSON.stringify(generated)!==JSON.stringify(saved.set)) throw Error('Set incompatibil');
        for(const field of ['measurements','activity','calculationVerified','heating','mixing'])
          if(!saved[field] || typeof saved[field]!=='object') throw Error('Progres incomplet');
        if(!Array.isArray(saved.heating.expected) || !Array.isArray(saved.mixing.expected)) throw Error('Etape incomplete');
      }catch(error){try{sessionStorage.removeItem(key);}catch(_){}return false;}
      restoring=true;
      for(const name of keys) if(saved[name]!==undefined) state[name]=saved[name];
      state.completed=new Set(saved.completed.filter(n=>Number.isInteger(n)&&n>=0&&n<=7));
      if(state.completed.has(2)) api.renderInitialStage();
      if(state.heating.index>=2) api.showBodyThermometer();
      if(state.mixing.index>=2) api.showEquilibriumThermometer();
      if(Object.values(state.measurements).every(Boolean)){
        api.renderMeasurementSummary();api.updateCalculationDependencies();api.updateCalculationProgress();
      }
      for(const item of saved.ui){
        let el;try{el=root.querySelector(item.path);}catch(_){continue;}
        if(!el || !el.closest('[data-panel]')) continue;
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
      if(migrated) api.invalidateAnalysis();
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
  global.Exp02Progress=Object.freeze({install});
})(globalThis);
