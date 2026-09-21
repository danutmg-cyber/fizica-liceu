/* ======================================================================
   FIZICA-LICEU
   AFISAREA SI RETRIMITEREA RAPOARTELOR NETRIMISE

   Folosit in:
   laborator-fizica/index.html

   Citeste coada comuna utilizata de google-sheets.js:
   fizica-laborator-rezultate-netrimise
====================================================================== */

(() => {

    "use strict";

    const STORAGE_KEY =
        "fizica-laborator-rezultate-netrimise";


    const qs = selector =>
        document.querySelector(selector);


    function clone(value) {

        if (typeof structuredClone === "function") {
            return structuredClone(value);
        }

        return JSON.parse(
            JSON.stringify(value)
        );

    }


    function readQueue() {

        try {

            const raw =
                localStorage.getItem(
                    STORAGE_KEY
                );

            if (!raw) {
                return [];
            }

            const data =
                JSON.parse(raw);

            return Array.isArray(data)
                ? data
                : [];

        }
        catch (error) {

            console.warn(
                "[RapoarteNetrimise] Coada nu a putut fi citita.",
                error
            );

            return [];

        }

    }


    function formatDate(value) {

        if (!value) {
            return "dată necunoscută";
        }

        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "dată necunoscută";
        }


        return new Intl.DateTimeFormat(
            "ro-RO",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }
        ).format(date);

    }


    function getExperimentCode(payload) {

        const experiment =
            payload?.experiment || {};


        /*
           În noile experimente recomand:

           code: "EXP01"

           Dacă acest câmp nu există,
           încercăm să-l deducem din id.
        */

        if (experiment.code) {

            return String(
                experiment.code
            ).toUpperCase();

        }


        const source =
            String(
                experiment.id ||
                experiment.title ||
                ""
            );


        /*
           Recunoaște:
           exp-01
           exp01
           experimentul-1
           experiment-02
        */

        const match =
            source.match(
                /(?:exp(?:erimentul|eriment)?)[\s_-]*0*(\d{1,2})/i
            );


        if (match) {

            return (
                "EXP" +
                String(match[1])
                    .padStart(2, "0")
            );

        }


        return "RAPORT";

    }


    function getReportDate(item) {

        return (
            item?.payload?.session?.finishedAt ||
            item?.payload?.report?.finishedAt ||
            item?.queuedAt ||
            null
        );

    }


    function getStudentDescription(payload) {

        const student =
            payload?.student || {};


        const parts = [];


        if (student.className) {

            parts.push(
                `Clasa ${student.className}`
            );

        }


        if (
            student.catalogNumber !== undefined &&
            student.catalogNumber !== null &&
            student.catalogNumber !== ""
        ) {

            parts.push(
                `nr. ${student.catalogNumber}`
            );

        }


        return (
            parts.join(" • ") ||
            "Date elev disponibile în raport"
        );

    }


    function escapeHtml(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }


    function createReportCard(item) {

        const payload =
            item.payload || {};


        const code =
            getExperimentCode(
                payload
            );


        const date =
            formatDate(
                getReportDate(item)
            );


        const title =
            payload?.experiment?.title ||
            "Experiment de fizică";


        const reportId =
            item.reportId ||
            payload.reportId ||
            "—";


        const student =
            getStudentDescription(
                payload
            );


        const article =
            document.createElement(
                "article"
            );


        article.className =
            "pending-report-card";


        article.dataset.reportId =
            reportId;


        article.innerHTML = `

            <div class="pending-report-info">

                <div class="pending-report-heading">

                    <span class="pending-report-code">
                        ${escapeHtml(code)}
                    </span>

                    <strong>
                        ${escapeHtml(title)}
                    </strong>

                </div>


                <div class="pending-report-meta">

                    <span>
                        ${escapeHtml(student)}
                    </span>

                    <span>
                        ${escapeHtml(date)}
                    </span>

                </div>


                <div class="pending-report-id">
                    ID raport:
                    <code>${escapeHtml(reportId)}</code>
                </div>


                ${
                    item.lastError
                        ? `
                        <div class="pending-report-error">
                            Ultima problemă:
                            ${escapeHtml(item.lastError)}
                        </div>
                        `
                        : ""
                }

            </div>


            <div class="pending-report-actions">

                <button
                    type="button"
                    class="pending-report-retry"
                    data-retry-report="${escapeHtml(reportId)}">

                    Retrimite raportul
                    ${escapeHtml(code)}
                    – ${escapeHtml(date)}

                </button>

                <span
                    class="pending-report-status"
                    data-retry-status
                    aria-live="polite">
                </span>

            </div>

        `;


        return article;

    }


    function render() {

        const section =
            qs(
                "[data-pending-reports]"
            );


        const list =
            qs(
                "[data-pending-reports-list]"
            );


        const counter =
            qs(
                "[data-pending-reports-count]"
            );


        if (
            !section ||
            !list
        ) {
            return;
        }


        const queue =
            readQueue();


        list.innerHTML = "";


        if (counter) {

            counter.textContent =
                String(queue.length);

        }


        /*
           Dacă nu există rapoarte netrimise,
           secțiunea dispare complet.
        */

        if (!queue.length) {

            section.hidden = true;

            return;

        }


        section.hidden = false;


        /*
           Cele mai recente apar primele.
        */

        const sorted =
            [...queue].sort(
                (a, b) =>
                    Date.parse(
                        b.queuedAt || 0
                    ) -
                    Date.parse(
                        a.queuedAt || 0
                    )
            );


        for (const item of sorted) {

            list.append(
                createReportCard(
                    item
                )
            );

        }

    }


    async function retryReport(
        reportId,
        button
    ) {

        const queue =
            readQueue();


        const item =
            queue.find(
                report =>
                    report.reportId ===
                    reportId
            );


        if (!item) {

            render();

            return;

        }


        const card =
            button.closest(
                ".pending-report-card"
            );


        const status =
            card?.querySelector(
                "[data-retry-status]"
            );


        button.disabled = true;


        if (status) {

            status.textContent =
                "Se retransmite…";

            status.className =
                "pending-report-status is-sending";

        }


        try {

            if (
                !globalThis
                    .LaboratorGoogleSheets
                    ?.submit
            ) {

                throw new Error(
                    "Modulul Google Sheets nu este disponibil."
                );

            }


            const result =
                await globalThis
                    .LaboratorGoogleSheets
                    .submit(
                        clone(item.payload),
                        {
                            force: true
                        }
                    );


            if (status) {

                status.textContent =
                    result?.status === "duplicate"
                        ? "Raportul există deja."
                        : "Retrimitere efectuată.";

                status.className =
                    "pending-report-status is-success";

            }


            /*
               google-sheets.js elimină automat
               raportul din coadă la succes.
            */

            window.setTimeout(
                render,
                700
            );

        }
        catch (error) {

            console.error(
                "[RapoarteNetrimise]",
                error
            );


            button.disabled = false;


            if (status) {

                status.textContent =
                    "Nu s-a putut retransmite. Raportul rămâne salvat.";

                status.className =
                    "pending-report-status is-error";

            }

        }

    }


    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-retry-report]"
                );


            if (!button) {
                return;
            }


            const reportId =
                button.dataset
                    .retryReport;


            retryReport(
                reportId,
                button
            );

        }
    );


    /*
       Actualizare după trimitere/retrimitere.
    */

    document.addEventListener(
        "laborator:submission-sent",
        render
    );


    document.addEventListener(
        "laborator:submission-failed",
        render
    );


    /*
       Dacă altă filă modifică localStorage.
    */

    window.addEventListener(
        "storage",
        event => {

            if (
                event.key ===
                STORAGE_KEY
            ) {

                render();

            }

        }
    );


    /*
       Reafișăm starea când conexiunea revine.

       google-sheets.js are deja propriul
       mecanism de retry la evenimentul online.
    */

    window.addEventListener(
        "online",
        () => {

            window.setTimeout(
                render,
                1000
            );

        }
    );


    document.addEventListener(
        "DOMContentLoaded",
        render
    );


    globalThis
        .LaboratorRapoarteNetrimise = {

            render,

            getReports:
                () => clone(
                    readQueue()
                ),

            retryReport

        };

})();
