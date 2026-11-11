(function(global){
    "use strict";

    // Fontul PDF existent este ASCII: păstrăm sensul formulelor prin echivalente text.
    const physicsSymbols = {"±":"+/-","−":"-","﹣":"-","－":"-","–":"-","—":"-","π":" pi ","λ":" lambda ","θ":" theta ","ω":" omega ","Ω":" ohm ","μ":" mu ","µ":" mu ","ν":" nu ","ε":" epsilon ","Δ":" Delta ","δ":" delta ","α":" alpha ","β":" beta ","γ":" gamma ","ρ":" rho ","η":" eta ","σ":" sigma ","φ":" phi ","ϕ":" phi ","Σ":" Sigma ","√":"sqrt","∞":"infinity","∝":" proportional cu ","×":"*","·":"*","°":" grade ","≤":"<=","≥":">=","≠":"!=","≈":"~=","“":"\"","”":"\"","’":"'","…":"..."};
    const superscripts = {"⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁺":"+","⁻":"-"};
    const subscripts = {"₀":"0","₁":"1","₂":"2","₃":"3","₄":"4","₅":"5","₆":"6","₇":"7","₈":"8","₉":"9","ₐ":"a","ₑ":"e","ₒ":"o","ₓ":"x","ₙ":"n","ₘ":"m","ₛ":"s","ₜ":"t","ᵢ":"i","ⱼ":"j"};

    function asciiText(value){
        return String(value ?? "")
            .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, sequence => "^" + Array.from(sequence, character => superscripts[character]).join(""))
            .replace(/[₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₙₘₛₜᵢⱼ]+/g, sequence => "_" + Array.from(sequence, character => subscripts[character]).join(""))
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ș|ş/g, "s")
            .replace(/Ș|Ş/g, "S")
            .replace(/ț|ţ/g, "t")
            .replace(/Ț|Ţ/g, "T")
            .replace(/[^\x20-\x7E]/g, character => physicsSymbols[character] || " ");
    }

    function pdfEscape(value){
        return asciiText(value)
            .replace(/\\/g, "\\\\")
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)");
    }

    function wrapLine(text, maximum=52){
        const words=asciiText(text).trim().split(/\s+/),lines=[];let line="";
        for(let word of words){
            if(line && line.length+word.length+1>maximum){lines.push(line);line="";}
            while(word.length>maximum){lines.push(word.slice(0,maximum));word=word.slice(maximum);}
            if(word)line=line?line+" "+word:word;
        }
        if(line||!lines.length)lines.push(line);return lines;
    }

    function byteLength(value){
        return new TextEncoder().encode(value).length;
    }

    function createTextPdfBlob(originalLines){
        const lines = originalLines.flatMap(line => wrapLine(line));
        const perPage = 48;
        const pages = [];

        for(let index=0; index<lines.length; index+=perPage){
            pages.push(lines.slice(index, index + perPage));
        }

        if(!pages.length){
            pages.push(["Raport"]);
        }

        const objects = [];
        objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
        objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

        const pageIds = [];

        pages.forEach((page,index) => {
            const pageId = 4 + index * 2;
            const contentId = pageId + 1;
            pageIds.push(pageId);

            const content = [
                "BT",
                "/F1 10 Tf",
                "50 790 Td",
                "14 TL",
                ...page.flatMap(line => [
                    `(${pdfEscape(line)}) Tj`,
                    "T*"
                ]),
                "ET"
            ].join("\n");

            objects[pageId] =
                `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;

            objects[contentId] =
                `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`;
        });

        objects[2] =
            `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

        let pdf = "%PDF-1.4\n%1234\n";
        const offsets = [0];

        for(let id=1; id<objects.length; id+=1){
            offsets[id] = byteLength(pdf);
            pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
        }

        const xref = byteLength(pdf);
        pdf += `xref\n0 ${objects.length}\n`;
        pdf += "0000000000 65535 f \n";

        for(let id=1; id<objects.length; id+=1){
            pdf += `${String(offsets[id]).padStart(10,"0")} 00000 n \n`;
        }

        pdf +=
            `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

        return new Blob([pdf], {type:"application/pdf"});
    }

    const PORTFOLIO_DB = "fizica-laborator-portofoliu";
    let dbPromise;
    function openPortfolio(){
        if(dbPromise) return dbPromise;
        dbPromise = new Promise((resolve,reject) => {
            if(!global.indexedDB){ reject(new Error("Stocarea nu este disponibilă.")); return; }
            const request = global.indexedDB.open(PORTFOLIO_DB,1);
            request.onupgradeneeded = () => request.result.createObjectStore("pdf",{keyPath:"fileName"});
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("Stocarea este ocupată."));
        });
        dbPromise.catch(()=>{dbPromise=null;});
        return dbPromise;
    }
    async function rememberPdf(blob,fileName,title){
        const db = await openPortfolio();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction("pdf","readwrite");
            tx.objectStore("pdf").put({fileName,title,blob,updatedAt:new Date().toISOString()});
            tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
        });
    }
    async function getSavedPdfs(){
        const db=await openPortfolio();
        return new Promise((resolve,reject)=>{
            const request=db.transaction("pdf","readonly").objectStore("pdf").getAll();
            request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
            request.onerror=()=>reject(request.error);
        });
    }
    function prepareFile(blob,fileName){
        if(!(blob instanceof Blob) || !blob.size) throw new Error("Raportul PDF este gol.");
        const name=String(fileName||"raport-laborator.pdf").replace(/[\\/:*?"<>|]/g,"_");
        return {name:name.toLowerCase().endsWith(".pdf")?name:name+".pdf",blob};
    }
    function downloadBlob(blob,name){
        const url=URL.createObjectURL(blob),a=document.createElement("a");
        a.href=url;a.download=name;a.style.display="none";document.body.append(a);a.click();a.remove();
        global.setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    function shareableFile(blob,name){
        try{
            if(typeof global.File!=="function" || typeof navigator.share!=="function" || typeof navigator.canShare!=="function")return null;
            const file=new File([blob],name,{type:"application/pdf"});
            return navigator.canShare({files:[file]})?file:null;
        }catch{return null;}
    }
    async function saveBlob(blob,fileName,title="Raport experiment"){
        const {name}=prepareFile(blob,fileName);
        rememberPdf(blob,name,title).catch(()=>{});
        const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
        const file=apple?shareableFile(blob,name):null;
        if(file){
            try{await navigator.share({files:[file],title});return {status:"shared",fileName:name};}
            catch(error){if(error?.name==="AbortError")return {status:"cancelled",fileName:name};}
        }
        downloadBlob(blob,name);return {status:"downloaded",fileName:name};
    }
    async function shareBlob(blob,fileName,title="Raport experiment"){
        const {name}=prepareFile(blob,fileName),file=shareableFile(blob,name);
        rememberPdf(blob,name,title).catch(()=>{});
        if(file){
            try{await navigator.share({files:[file],title});return {status:"shared",fileName:name};}
            catch(error){if(error?.name==="AbortError")return {status:"cancelled",fileName:name};}
        }
        downloadBlob(blob,name);return {status:"downloaded",fileName:name};
    }

    global.LaboratorPdfLocal=Object.freeze({createTextPdfBlob,saveBlob,shareBlob,getSavedPdfs});
})(globalThis);
