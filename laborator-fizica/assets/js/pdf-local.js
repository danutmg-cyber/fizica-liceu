(function(global){
    "use strict";

    function asciiText(value){
        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ș|ş/g, "s")
            .replace(/Ș|Ş/g, "S")
            .replace(/ț|ţ/g, "t")
            .replace(/Ț|Ţ/g, "T")
            .replace(/[^\x20-\x7E]/g, " ");
    }

    function pdfEscape(value){
        return asciiText(value)
            .replace(/\\/g, "\\\\")
            .replace(/\(/g, "\\(")
            .replace(/\)/g, "\\)");
    }

    function wrapLine(text, maximum=82){
        const words = asciiText(text).trim().split(/\s+/);

        if(words.length === 1 && words[0] === ""){
            return [""];
        }

        const lines = [];
        let line = "";

        words.forEach(word => {
            const next = line ? `${line} ${word}` : word;

            if(next.length > maximum && line){
                lines.push(line);
                line = word;
            }
            else{
                line = next;
            }
        });

        if(line){
            lines.push(line);
        }

        return lines;
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

    function isAppleMobile(){
        return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    async function saveBlob(blob,fileName,title="Raport experiment"){
        const file = new File([blob], fileName, {type:"application/pdf"});

        if(
            isAppleMobile()
            && navigator.share
            && navigator.canShare?.({files:[file]})
        ){
            try{
                await navigator.share({files:[file], title});
                return;
            }
            catch(error){
                if(error?.name === "AbortError"){
                    return;
                }
            }
        }

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.style.display = "none";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();

        global.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    global.LaboratorPdfLocal = Object.freeze({
        createTextPdfBlob,
        saveBlob
    });
})(globalThis);
