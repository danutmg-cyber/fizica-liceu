(function(g){
    "use strict";
    const KEY="fizica-laborator-rapoarte-locale";
    const LEGACY_KEY="fizica-laborator-rezultate-netrimise";
    const clone=x=>JSON.parse(JSON.stringify(x??null));
    const label={student:"Elev",name:"Nume",studentName:"Nume",className:"Clasa",class:"Clasa",studentClass:"Clasa",catalogNumber:"Nr. catalog",title:"Experiment",experiment:"Experiment",startedAt:"Început",finishedAt:"Finalizat",generatedAt:"Data raportului",initialData:"Date inițiale",measurements:"Măsurări",calculations:"Calcule",calculationSteps:"Etapele calculului",conclusion:"Concluzie",errorSources:"Surse de eroare",evaluation:"Evaluare",score:"Punctaj",maximumScore:"Punctaj maxim",answers:"Răspunsuri",question:"Întrebare",studentAnswer:"Răspuns elev",correct:"Corect",value:"Valoare",unit:"Unitate",symbol:"Simbol",note:"Observații",observations:"Observații",notebook:"Fișa de laborator",equipment:"Materiale",safety:"Securitate",result:"Rezultat",grade:"Nota"};
    let initialized=false,latest=null;
    function read(key){try{return JSON.parse(localStorage.getItem(key)||"[]");}catch{return [];}}
    function storedReports(){const own=read(KEY),legacy=read(LEGACY_KEY),all=[...(Array.isArray(own)?own:[]),...(Array.isArray(legacy)?legacy.map(x=>x.payload||x):[])];return all.filter(x=>x&&typeof x==="object");}
    function reportLines(report){
        const lines=["RAPORT DE LABORATOR - FIZICA",""];
        const skip=new Set(["application","monitoring","eventLog","rawEvents","payload","lastError","lastTransport","userAgent","pageUrl","transport","submission","status"]);
        function visit(v,key,depth){
            if(v===null||v===undefined||skip.has(key)||depth>8)return;
            if(v===""||(typeof v==="object"&&Object.keys(v).length===0))return;
            const title=({reportId:"Codul lucrării",id:"Cod",time:"Timp"})[key]||label[key]||key.replace(/[_-]/g," ").replace(/([a-z])([A-Z])/g,"$1 $2");
            if(typeof v!=="object"){lines.push(`${title}: ${typeof v==="boolean"?(v?"Da":"Nu"):String(v)}`);return;}
            if(key)lines.push("",title.toUpperCase());
            if(Array.isArray(v))v.forEach((item,i)=>visit(item,String(i+1),depth+1));
            else Object.entries(v).forEach(([k,item])=>visit(item,k,depth+1));
        }
        Object.entries(report).forEach(([k,v])=>visit(v,k,0));
        lines.push("","Păstrează raportul pentru portofoliu sau trimite PDF-ul profesorului.");
        return lines;
    }
    function buildData(evaluation){
        const session=g.LAB_SESSION||g.LaboratorIdentificare?.getState?.()?.session||{};
        const experiment=g.LAB_EXPERIMENT_CONFIG||{};
        return {reportId:session.reportId||session.sessionId||g.crypto?.randomUUID?.()||String(Date.now()),student:{name:session.studentName||session.name||"",className:session.studentClass||session.className||"",catalogNumber:session.catalogNumber??""},experiment:{id:experiment.id||"",title:experiment.title||document.title},startedAt:session.startedAt||"",finishedAt:evaluation?.finishedAt||new Date().toISOString(),notebook:clone(g.LaboratorCaiet?.getState?.()||g.LAB_NOTEBOOK_STATE||{}),equipment:clone(g.LaboratorEchipamente?.getState?.()||{}),safety:clone(g.LaboratorSecuritate?.getState?.()||g.LAB_SAFETY_STATE||{}),evaluation:clone(evaluation||g.LaboratorEvaluare?.getResult?.()||{})};
    }
    function saveReport(report){const list=read(KEY),items=Array.isArray(list)?list:[],i=items.findIndex(r=>r.reportId===report.reportId);if(i>=0)items[i]=report;else items.push(report);try{localStorage.setItem(KEY,JSON.stringify(items));return true;}catch{return false;}}
    function fileName(report){return `raport-${report.student?.className||report.student?.class||"fizica"}-${report.student?.catalogNumber||""}-${report.reportId||Date.now()}.pdf`.replace(/[\\/:*?"<>|]/g,"_");}
    async function exportReport(report=latest,share=false){if(!report)throw Error("Finalizează mai întâi experimentul.");const api=g.LaboratorPdfLocal;if(!api)throw Error("Reîncarcă pagina și încearcă din nou.");const blob=api.createTextPdfBlob(reportLines(report));return share?api.shareBlob(blob,fileName(report),"Raport de laborator"):api.saveBlob(blob,fileName(report),"Raport de laborator");}
    function render(report){
        const root=document.querySelector('[data-lab-component="raport-final"]');if(!root)return;root.hidden=false;
        const fields={"student-name":report.student.name,"student-class":report.student.className,"experiment-title":report.experiment.title,"experiment-date":new Date(report.finishedAt).toLocaleDateString('ro-RO'),"finish-time":new Date(report.finishedAt).toLocaleTimeString('ro-RO'),"generated-at":new Date().toLocaleString('ro-RO'),"id":report.reportId,"state":"Pregătit pentru PDF","evaluation-score":`${report.evaluation.score??"—"}/${report.evaluation.maximumScore??10}`,"student-conclusion":report.evaluation.conclusion||report.notebook.conclusion||"—"};
        Object.entries(fields).forEach(([key,value])=>root.querySelectorAll(`[data-report-${key}]`).forEach(el=>el.textContent=value));
        const generation=root.querySelector('[data-report-generation-status]');if(generation)generation.textContent="Raportul este pregătit.";
        const data=root.querySelector('[data-local-report-data]');if(data)data.textContent=reportLines(report).join('\n');
    }
    async function catalog(){
        const root=document.querySelector('[data-saved-reports]');if(!root)return;
        const list=root.querySelector('[data-saved-reports-list]');list.replaceChildren();let entries=[];
        try{entries=await g.LaboratorPdfLocal.getSavedPdfs();}catch{}
        const reports=storedReports();root.hidden=!entries.length&&!reports.length;
        const add=(title,sub,download,share)=>{const card=document.createElement('article');card.className='report-card';const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=sub;const actions=document.createElement('div');actions.className='report-actions';for(const [text,fn]of [['Descarcă PDF',download],['Distribuie PDF',share]]){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await fn();}catch{p.textContent='PDF-ul nu a putut fi salvat. Încearcă din nou.';}finally{b.disabled=false;}};actions.append(b);}card.append(h,p,actions);list.append(card);};
        entries.forEach(entry=>add(entry.fileName,new Date(entry.updatedAt).toLocaleString('ro-RO'),()=>g.LaboratorPdfLocal.saveBlob(entry.blob,entry.fileName,entry.title),()=>g.LaboratorPdfLocal.shareBlob(entry.blob,entry.fileName,entry.title)));
        reports.forEach(r=>add(r.experiment?.title||'Raport de laborator',[r.student?.name,r.student?.className||r.student?.class,r.reportId].filter(Boolean).join(' · '),()=>exportReport(r),()=>exportReport(r,true)));
    }
    function init(){
        if(initialized)return;initialized=true;
        document.addEventListener('laborator:evaluation-complete',event=>{latest=buildData(event.detail);saveReport(latest);render(latest);});
        document.addEventListener('click',event=>{if(event.target.closest('[data-action="print-final-report"]')){event.preventDefault();g.print();}});
        document.addEventListener('click',async event=>{const b=event.target.closest('[data-action="download-final-report"],[data-action="download-report"],[data-action="share-final-report"]');if(!b)return;event.preventDefault();b.disabled=true;const status=document.querySelector('[data-report-export-status]');try{await exportReport(latest,b.dataset.action==='share-final-report');if(status)status.textContent='Raportul PDF este pregătit pentru portofoliu.';}catch(error){if(status)status.textContent=error.message;}finally{b.disabled=false;}});
        catalog();
    }
    g.LaboratorRaport=Object.freeze({init,getData:()=>clone(latest),buildData,saveReport,storedReports,reportLines,exportReport});
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
