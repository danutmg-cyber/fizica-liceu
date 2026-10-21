(function(global){
    "use strict";

    // Transformă raportul HTML al experimentului într-un PDF text, generat local
    // (fără rețea și fără window.print), identic ca mecanism cu clasele 6, 10 și 11.

    const BLOCK = new Set([
        "P","DIV","SECTION","ARTICLE","HEADER","FOOTER","UL","OL","LI",
        "H1","H2","H3","H4","H5","H6","PRE","BLOCKQUOTE","FIGURE","FIGCAPTION"
    ]);
    const SKIP = new Set(["SCRIPT","STYLE","BUTTON","NOSCRIPT","SVG","CANVAS","IMG","HEAD"]);

    function clean(text){
        return String(text ?? "").replace(/\s+/g, " ").trim();
    }

    function collect(node, lines){
        if(node.nodeType === Node.TEXT_NODE){
            return clean(node.textContent);
        }

        if(node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName.toUpperCase())){
            return "";
        }

        const tag = node.tagName.toUpperCase();

        if(tag === "TABLE"){
            lines.push("");
            node.querySelectorAll("tr").forEach(row => {
                const cells = Array.from(row.children)
                    .map(cell => clean(cell.textContent))
                    .filter(Boolean);

                if(cells.length){
                    lines.push(cells.join(" | "));
                }
            });
            lines.push("");
            return "";
        }

        if(tag === "BR"){
            lines.push("");
            return "";
        }

        let inline = "";

        node.childNodes.forEach(child => {
            const text = collect(child, lines);

            if(text){
                inline += (inline ? " " : "") + text;
            }
        });

        if(!BLOCK.has(tag)){
            return inline;
        }

        if(inline){
            const heading = /^H[1-6]$/.test(tag);

            if(heading){
                lines.push("");
            }

            lines.push(tag === "LI" ? `- ${inline}` : inline);

            if(heading){
                lines.push("");
            }
        }

        return "";
    }

    function htmlToLines(reportHtml){
        const doc = new DOMParser().parseFromString(String(reportHtml ?? ""), "text/html");
        const lines = [];
        const trailing = collect(doc.body, lines);

        if(trailing){
            lines.push(trailing);
        }

        return lines.filter((line, index) => line !== "" || lines[index - 1] !== "");
    }

    async function saveReport(reportHtml, fileName, title="Raport experiment"){
        const pdf = global.LaboratorPdfLocal;

        if(!pdf){
            throw new Error("Modulul PDF local (pdf-local.js) nu este încărcat.");
        }

        const lines = htmlToLines(reportHtml);

        if(!lines.some(Boolean)){
            throw new Error("Raportul nu conține text.");
        }

        const blob = pdf.createTextPdfBlob(lines);
        await pdf.saveBlob(blob, fileName, title);
    }

    global.LaboratorPdfHtml = Object.freeze({ htmlToLines, saveReport });
})(globalThis);
