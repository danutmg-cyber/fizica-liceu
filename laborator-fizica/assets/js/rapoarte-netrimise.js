/* ======================================================================
   FIZICA-LICEU
   rapoarte-netrimise.js

   Modul pentru afișarea și retransmiterea rapoartelor salvate local.

   DESTINAȚIE:
   laborator-fizica/assets/js/rapoarte-netrimise.js

   FOLOSIRE:
   în pagina principală laborator-fizica/index.html

   NECESITĂ:
   assets/js/google-sheets.js

   FUNCȚIONALITĂȚI:

   1. Citește rapoartele păstrate de LaboratorGoogleSheets.
   2. Afișează secțiunea:
      "Rapoarte netrimise de pe acest dispozitiv".
   3. Ascunde automat secțiunea dacă nu există rapoarte.
   4. Distinge:
        - pending
        - unconfirmed
   5. Permite retransmiterea individuală.
   6. Permite retransmiterea tuturor rapoartelor.
   7. Actualizează interfața după:
        - trimitere reușită;
        - duplicat;
        - eroare;
        - modificarea localStorage;
        - revenirea conexiunii.
   8. Nu permite elevului să șteargă manual raportul.
   9. Nu reconstruiește raportul.
      Retrimite EXACT payload-ul salvat inițial.

   MARCAJE HTML AȘTEPTATE:

   [data-pending-reports]
   [data-pending-reports-count]
   [data-pending-reports-list]
   [data-retry-all-reports]
   [data-pending-global-status]

   ====================================================================== */

(() => {

    "use strict";


    /* ==================================================================
       CONSTANTE
    ================================================================== */

    const MODULE_VERSION =
        "1.0.0";


    const FALLBACK_STORAGE_KEY =
        "fizica-laborator-rezultate-netrimise";


    /* ==================================================================
       STARE
    ================================================================== */

    const state = {

        initialized:false,

        renderTimer:null,

        retryingReportIds:
            new Set(),

        retryingAll:false

    };


    /* ==================================================================
       SELECTORI
    ================================================================== */

    const SELECTORS = {

        section:
            "[data-pending-reports]",

        list:
            "[data-pending-reports-list]",

        count:
            "[data-pending-reports-count]",

        retryAll:
            "[data-retry-all-reports]",

        globalStatus:
            "[data-pending-global-status]"

    };


    /* ==================================================================
       UTILITARE DOM
    ================================================================== */

    function qs(
        selector,
        scope=document
    ){

        return scope.querySelector(
            selector
        );

    }


    function createElement(
        tag,
        options={}
    ){

        const element =
            document.createElement(
                tag
            );


        if(options.className){

            element.className =
                options.className;

        }


        if(
            options.text !==
            undefined
        ){

            element.textContent =
                options.text;

        }


        if(options.attributes){

            for(
                const [name,value]
                of Object.entries(
                    options.attributes
                )
            ){

                if(
                    value === null ||
                    value === undefined
                ){

                    continue;

                }


                element.setAttribute(
                    name,
                    String(value)
                );

            }

        }


        return element;

    }


    /* ==================================================================
       API GOOGLE SHEETS
    ================================================================== */

    function sheetsApi(){

        return (
            globalThis
                .LaboratorGoogleSheets ||
            null
        );

    }


    /* ==================================================================
       CHEIA localStorage
    ================================================================== */

    function getStorageKey(){

        try{

            return (
                sheetsApi()
                    ?.getQueueKey?.() ||
                FALLBACK_STORAGE_KEY
            );

        }
        catch(error){

            return FALLBACK_STORAGE_KEY;

        }

    }


    /* ==================================================================
       CITIRE RAPOARTE
    ================================================================== */

    function getReports(){

        try{

            const api =
                sheetsApi();


            if(
                api &&
                typeof api
                    .getPendingReports ===
                    "function"
            ){

                const reports =
                    api.getPendingReports();


                return Array.isArray(
                    reports
                )
                    ? reports
                    : [];

            }

        }
        catch(error){

            console.warn(
                "[RapoarteNetrimise] API-ul Google Sheets nu a putut fi citit.",
                error
            );

        }


        /*
           Fallback direct la localStorage.
        */

        try{

            const raw =
                globalThis
                    .localStorage
                    ?.getItem(
                        getStorageKey()
                    );


            if(!raw){

                return [];

            }


            const parsed =
                JSON.parse(raw);


            return Array.isArray(
                parsed
            )
                ? parsed
                : [];

        }
        catch(error){

            console.warn(
                "[RapoarteNetrimise] Coada locală nu a putut fi citită.",
                error
            );


            return [];

        }

    }


    /* ==================================================================
       DATA RAPORTULUI
    ================================================================== */

    function reportDate(
        item
    ){

        const payload =
            item?.payload ||
            {};


        return (

            payload
                ?.session
                ?.finishedAt ||

            payload
                ?.evaluation
                ?.finishedAt ||

            payload
                ?.report
                ?.finishedAt ||

            payload
                ?.session
                ?.startedAt ||

            item?.queuedAt ||

            item?.updatedAt ||

            null

        );

    }


    /* ==================================================================
       FORMATAREA DATEI
    ================================================================== */

    function formatDate(
        value
    ){

        if(!value){

            return "dată necunoscută";

        }


        const date =
            new Date(
                value
            );


        if(
            Number.isNaN(
                date.getTime()
            )
        ){

            return "dată necunoscută";

        }


        return new Intl.DateTimeFormat(
            "ro-RO",
            {
                day:"2-digit",
                month:"2-digit",
                year:"numeric"
            }
        ).format(date);

    }


    /* ==================================================================
       FORMATAREA DATEI ȘI OREI
    ================================================================== */

    function formatDateTime(
        value
    ){

        if(!value){

            return "";

        }


        const date =
            new Date(
                value
            );


        if(
            Number.isNaN(
                date.getTime()
            )
        ){

            return "";

        }


        return new Intl.DateTimeFormat(
            "ro-RO",
            {
                day:"2-digit",
                month:"2-digit",
                year:"numeric",
                hour:"2-digit",
                minute:"2-digit"
            }
        ).format(date);

    }


    /* ==================================================================
       CODUL EXPERIMENTULUI
    ================================================================== */

    function experimentCode(
        item
    ){

        const experiment =
            item
                ?.payload
                ?.experiment ||
            {};


        /*
           Varianta recomandată:
           experiment.code = "EXP01"
        */

        const directCode =
            String(
                experiment.code ||
                ""
            )
                .trim()
                .toUpperCase();


        if(directCode){

            return directCode;

        }


        /*
           Pentru experimente mai vechi încercăm să deducem
           numărul din experiment.id.
        */

        const source =
            String(

                experiment.id ||

                experiment.title ||

                ""

            );


        const patterns = [

            /(?:^|[-_\s])exp[-_\s]*0*(\d{1,2})(?:$|[-_\s])/i,

            /experiment(?:ul)?[-_\s]*0*(\d{1,2})/i,

            /exp(?:eriment)?[-_\s]*0*(\d{1,2})/i

        ];


        for(
            const pattern
            of patterns
        ){

            const match =
                source.match(
                    pattern
                );


            if(match){

                return (
                    "EXP" +
                    String(
                        Number(
                            match[1]
                        )
                    ).padStart(
                        2,
                        "0"
                    )
                );

            }

        }


        return "RAPORT";

    }


    /* ==================================================================
       TITLUL EXPERIMENTULUI
    ================================================================== */

    function experimentTitle(
        item
    ){

        return (
            String(
                item
                    ?.payload
                    ?.experiment
                    ?.title ||
                "Experiment de fizică"
            ).trim() ||
            "Experiment de fizică"
        );

    }


    /* ==================================================================
       DATE ELEV
    ================================================================== */

    function studentInformation(
        item
    ){

        const student =
            item
                ?.payload
                ?.student ||
            {};


        const information =
            [];


        if(student.className){

            information.push(
                `Clasa ${student.className}`
            );

        }


        if(
            student.catalogNumber !==
                null &&
            student.catalogNumber !==
                undefined &&
            student.catalogNumber !==
                ""
        ){

            information.push(
                `nr. ${student.catalogNumber}`
            );

        }


        return information.join(
            " • "
        );

    }


    /* ==================================================================
       REPORT ID
    ================================================================== */

    function reportId(
        item
    ){

        return String(

            item?.reportId ||

            item
                ?.payload
                ?.reportId ||

            item
                ?.payload
                ?.report
                ?.reportId ||

            ""

        ).trim();

    }


    /* ==================================================================
       STATUSUL RAPORTULUI
    ================================================================== */

    function normalizeStatus(
        item
    ){

        const status =
            String(
                item?.status ||
                "pending"
            )
                .trim()
                .toLowerCase();


        if(
            status ===
            "unconfirmed"
        ){

            return "unconfirmed";

        }


        return "pending";

    }


    /* ==================================================================
       TEXT STATUS
    ================================================================== */

    function statusInformation(
        item
    ){

        const status =
            normalizeStatus(
                item
            );


        if(
            status ===
            "unconfirmed"
        ){

            return {

                className:
                    "is-unconfirmed",

                title:
                    "Trimitere neconfirmată",

                text:
                    "Datele au fost trimise, dar browserul nu a primit confirmarea salvării. Raportul poate fi retransmis în siguranță."

            };

        }


        return {

            className:
                "is-pending",

            title:
                "În așteptarea trimiterii",

            text:
                "Raportul este salvat pe acest dispozitiv și nu a fost încă confirmat în registru."

        };

    }


    /* ==================================================================
       SORTAREA RAPOARTELOR

       Cele mai recente apar primele.
    ================================================================== */

    function sortReports(
        reports
    ){

        return [
            ...reports
        ].sort(
            (
                first,
                second
            ) => {

                const firstDate =
                    Date.parse(
                        reportDate(first) ||
                        ""
                    ) ||
                    0;


                const secondDate =
                    Date.parse(
                        reportDate(second) ||
                        ""
                    ) ||
                    0;


                return (
                    secondDate -
                    firstDate
                );

            }
        );

    }


    /* ==================================================================
       STARE GLOBALĂ ÎN INTERFAȚĂ
    ================================================================== */

    function setGlobalStatus(
        message,
        type=""
    ){

        const element =
            qs(
                SELECTORS.globalStatus
            );


        if(!element){
            return;
        }


        element.textContent =
            message;


        element.classList.remove(

            "is-info",

            "is-success",

            "is-error",

            "is-warning"

        );


        if(type){

            element.classList.add(
                `is-${type}`
            );

        }

    }


    /* ==================================================================
       BUTON RETRIMITERE
    ================================================================== */

    function createRetryButton(
        item
    ){

        const id =
            reportId(
                item
            );


        const code =
            experimentCode(
                item
            );


        const date =
            formatDate(
                reportDate(
                    item
                )
            );


        const button =
            createElement(
                "button",
                {
                    className:
                        "pending-report-retry",

                    text:
                        `Retrimite raportul ${code} – ${date}`,

                    attributes:{
                        type:"button",
                        "data-retry-report":id
                    }
                }
            );


        if(
            !id ||
            state.retryingReportIds
                .has(id)
        ){

            button.disabled =
                true;

        }


        return button;

    }


    /* ==================================================================
       CARD RAPORT
    ================================================================== */

    function createReportCard(
        item
    ){

        const id =
            reportId(
                item
            );


        const code =
            experimentCode(
                item
            );


        const status =
            statusInformation(
                item
            );


        const article =
            createElement(
                "article",
                {
                    className:
                        "pending-report-card",

                    attributes:{
                        "data-report-id":id
                    }
                }
            );


        /* --------------------------------------------------------------
           INFORMAȚII
        -------------------------------------------------------------- */

        const information =
            createElement(
                "div",
                {
                    className:
                        "pending-report-info"
                }
            );


        const heading =
            createElement(
                "div",
                {
                    className:
                        "pending-report-heading"
                }
            );


        const codeElement =
            createElement(
                "span",
                {
                    className:
                        "pending-report-code",

                    text:
                        code
                }
            );


        const title =
            createElement(
                "strong",
                {
                    text:
                        experimentTitle(
                            item
                        )
                }
            );


        heading.append(
            codeElement,
            title
        );


        information.append(
            heading
        );


        /* --------------------------------------------------------------
           META
        -------------------------------------------------------------- */

        const meta =
            createElement(
                "div",
                {
                    className:
                        "pending-report-meta"
                }
            );


        const student =
            studentInformation(
                item
            );


        if(student){

            meta.append(
                createElement(
                    "span",
                    {
                        text:
                            student
                    }
                )
            );

        }


        const date =
            formatDate(
                reportDate(
                    item
                )
            );


        meta.append(
            createElement(
                "span",
                {
                    text:
                        date
                }
            )
        );


        const attempts =
            Number(
                item?.attempts ||
                0
            );


        if(attempts > 0){

            meta.append(
                createElement(
                    "span",
                    {
                        text:
                            attempts === 1
                                ? "1 tentativă"
                                : `${attempts} tentative`
                    }
                )
            );

        }


        information.append(
            meta
        );


        /* --------------------------------------------------------------
           STATUS
        -------------------------------------------------------------- */

        const statusBox =
            createElement(
                "div",
                {
                    className:
                        `pending-report-state ${status.className}`
                }
            );


        const statusTitle =
            createElement(
                "strong",
                {
                    text:
                        status.title
                }
            );


        const statusText =
            createElement(
                "span",
                {
                    text:
                        status.text
                }
            );


        statusBox.append(
            statusTitle,
            statusText
        );


        information.append(
            statusBox
        );


        /* --------------------------------------------------------------
           ULTIMA EROARE
        -------------------------------------------------------------- */

        if(
            item.lastError
        ){

            const errorBox =
                createElement(
                    "div",
                    {
                        className:
                            "pending-report-error"
                    }
                );


            errorBox.append(
                createElement(
                    "strong",
                    {
                        text:
                            "Ultima problemă: "
                    }
                ),
                document.createTextNode(
                    String(
                        item.lastError
                    )
                )
            );


            information.append(
                errorBox
            );

        }


        /* --------------------------------------------------------------
           ID RAPORT
        -------------------------------------------------------------- */

        const idBox =
            createElement(
                "div",
                {
                    className:
                        "pending-report-id"
                }
            );


        idBox.append(
            document.createTextNode(
                "ID raport: "
            )
        );


        idBox.append(
            createElement(
                "code",
                {
                    text:
                        id || "—"
                }
            )
        );


        information.append(
            idBox
        );


        /* --------------------------------------------------------------
           ULTIMA ÎNCERCARE
        -------------------------------------------------------------- */

        if(
            item.lastAttemptAt
        ){

            const lastAttempt =
                formatDateTime(
                    item.lastAttemptAt
                );


            if(lastAttempt){

                information.append(
                    createElement(
                        "div",
                        {
                            className:
                                "pending-report-last-attempt",

                            text:
                                `Ultima încercare: ${lastAttempt}`
                        }
                    )
                );

            }

        }


        /* --------------------------------------------------------------
           ACȚIUNI
        -------------------------------------------------------------- */

        const actions =
            createElement(
                "div",
                {
                    className:
                        "pending-report-actions"
                }
            );


        const retryButton =
            createRetryButton(
                item
            );


        const retryStatus =
            createElement(
                "span",
                {
                    className:
                        "pending-report-action-status",

                    attributes:{
                        "data-retry-status":"",
                        "aria-live":"polite"
                    }
                }
            );


        if(
            state.retryingReportIds
                .has(id)
        ){

            retryStatus.textContent =
                "Se retransmite…";


            retryStatus.classList.add(
                "is-sending"
            );

        }


        actions.append(
            retryButton,
            retryStatus
        );


        article.append(
            information,
            actions
        );


        return article;

    }


    /* ==================================================================
       RENDER
    ================================================================== */

    function render(){

        const section =
            qs(
                SELECTORS.section
            );


        const list =
            qs(
                SELECTORS.list
            );


        /*
           Modulul poate fi încărcat și pe pagini
           unde această secțiune nu există.
        */

        if(
            !section ||
            !list
        ){

            return;

        }


        const reports =
            sortReports(
                getReports()
            );


        const count =
            qs(
                SELECTORS.count
            );


        if(count){

            count.textContent =
                String(
                    reports.length
                );

        }


        /*
           Fără rapoarte -> secțiunea dispare.
        */

        if(
            reports.length ===
            0
        ){

            list.replaceChildren();


            section.hidden =
                true;


            setGlobalStatus(
                ""
            );


            return;

        }


        section.hidden =
            false;


        const fragment =
            document.createDocumentFragment();


        for(
            const item
            of reports
        ){

            fragment.append(
                createReportCard(
                    item
                )
            );

        }


        list.replaceChildren(
            fragment
        );


        /* --------------------------------------------------------------
           BUTON RETRIMITE TOATE
        -------------------------------------------------------------- */

        const retryAllButton =
            qs(
                SELECTORS.retryAll
            );


        if(retryAllButton){

            retryAllButton.disabled =
                state.retryingAll ||
                reports.length === 0;

        }


        /* --------------------------------------------------------------
           STATUS CONEXIUNE
        -------------------------------------------------------------- */

        if(
            globalThis.navigator &&
            globalThis.navigator
                .onLine ===
            false
        ){

            setGlobalStatus(
                "Dispozitivul este offline. Rapoartele sunt păstrate local și pot fi retransmise când conexiunea revine.",
                "warning"
            );

        }

    }


    /* ==================================================================
       RENDER PROGRAMAT

       Evită mai multe redesenări simultane dacă sosesc
       mai multe evenimente apropiate.
    ================================================================== */

    function scheduleRender(
        delay=50
    ){

        if(
            state.renderTimer
        ){

            globalThis.clearTimeout(
                state.renderTimer
            );

        }


        state.renderTimer =
            globalThis.setTimeout(
                () => {

                    state.renderTimer =
                        null;


                    render();

                },
                delay
            );

    }


    /* ==================================================================
       STATUSUL CARDULUI
    ================================================================== */

    function setCardStatus(
        reportIdValue,
        message,
        type=""
    ){

        const cards =
            document.querySelectorAll(
                "[data-report-id]"
            );


        let card =
            null;


        for(
            const candidate
            of cards
        ){

            if(
                candidate.dataset
                    .reportId ===
                reportIdValue
            ){

                card =
                    candidate;


                break;

            }

        }


        if(!card){
            return;
        }


        const statusElement =
            card.querySelector(
                "[data-retry-status]"
            );


        if(!statusElement){
            return;
        }


        statusElement.textContent =
            message;


        statusElement.classList.remove(

            "is-sending",

            "is-success",

            "is-error",

            "is-warning"

        );


        if(type){

            statusElement.classList.add(
                `is-${type}`
            );

        }

    }


    /* ==================================================================
       RETRIMITERE RAPORT
    ================================================================== */

    async function retryReport(
        reportIdValue
    ){

        const api =
            sheetsApi();


        if(
            !api ||
            typeof api.retryReport !==
                "function"
        ){

            throw new Error(
                "Modulul pentru transmiterea către Google Sheets nu este disponibil."
            );

        }


        if(
            globalThis.navigator &&
            globalThis.navigator
                .onLine ===
            false
        ){

            throw new Error(
                "Nu există conexiune la internet."
            );

        }


        if(
            state.retryingReportIds
                .has(
                    reportIdValue
                )
        ){

            return;

        }


        state.retryingReportIds
            .add(
                reportIdValue
            );


        setCardStatus(
            reportIdValue,
            "Se retransmite…",
            "sending"
        );


        scheduleRender();


        try{

            const result =
                await api.retryReport(
                    reportIdValue
                );


            /* ----------------------------------------------------------
               STORED
            ---------------------------------------------------------- */

            if(
                result?.status ===
                "stored"
            ){

                setCardStatus(
                    reportIdValue,
                    "Raport transmis și confirmat.",
                    "success"
                );


                setGlobalStatus(
                    "Raportul a fost transmis cu succes.",
                    "success"
                );


                return result;

            }


            /* ----------------------------------------------------------
               DUPLICATE
            ---------------------------------------------------------- */

            if(
                result?.status ===
                "duplicate"
            ){

                setCardStatus(
                    reportIdValue,
                    "Raportul exista deja în registru.",
                    "success"
                );


                setGlobalStatus(
                    "Raportul exista deja în registru; nu a fost creat un rând duplicat.",
                    "success"
                );


                return result;

            }


            /* ----------------------------------------------------------
               UNCONFIRMED
            ---------------------------------------------------------- */

            if(
                result?.status ===
                "unconfirmed"
            ){

                setCardStatus(
                    reportIdValue,
                    "Retrimiterea nu a fost confirmată. Raportul rămâne salvat.",
                    "warning"
                );


                setGlobalStatus(
                    "Serverul nu a confirmat încă salvarea. Raportul a rămas pe dispozitiv.",
                    "warning"
                );


                return result;

            }


            /*
               Răspuns necunoscut.
            */

            setCardStatus(
                reportIdValue,
                "Raportul rămâne salvat local.",
                "warning"
            );


            return result;

        }
        catch(error){

            console.error(
                "[RapoarteNetrimise]",
                error
            );


            setCardStatus(

                reportIdValue,

                error.message ||
                "Raportul nu a putut fi retransmis.",

                "error"

            );


            setGlobalStatus(
                "Retrimiterea nu a reușit. Datele au rămas salvate pe acest dispozitiv.",
                "error"
            );


            throw error;

        }
        finally{

            state.retryingReportIds
                .delete(
                    reportIdValue
                );


            /*
               Dacă stored/duplicate a eliminat raportul
               din coadă, cardul va dispărea.
            */

            scheduleRender(
                500
            );

        }

    }


    /* ==================================================================
       RETRIMITERE TOATE
    ================================================================== */

    async function retryAll(){

        if(
            state.retryingAll
        ){

            return;

        }


        if(
            globalThis.navigator &&
            globalThis.navigator
                .onLine ===
            false
        ){

            setGlobalStatus(
                "Nu există conexiune la internet.",
                "error"
            );


            return;

        }


        const api =
            sheetsApi();


        if(
            !api ||
            typeof api.retryPending !==
                "function"
        ){

            setGlobalStatus(
                "Modulul Google Sheets nu este disponibil.",
                "error"
            );


            return;

        }


        const reports =
            getReports();


        if(
            reports.length ===
            0
        ){

            render();


            return;

        }


        state.retryingAll =
            true;


        render();


        setGlobalStatus(
            "Se încearcă retransmiterea rapoartelor…",
            "info"
        );


        try{

            /*
               La acțiunea MANUALĂ retransmitem și
               rapoartele unconfirmed.

               Backend-ul deduplică după reportId.
            */

            const results =
                await api.retryPending({

                    includeUnconfirmed:
                        true,

                    stopOnError:
                        false

                });


            const stored =
                results.filter(
                    result =>
                        result.status ===
                        "stored"
                ).length;


            const duplicates =
                results.filter(
                    result =>
                        result.status ===
                        "duplicate"
                ).length;


            const failed =
                results.filter(
                    result =>
                        result.status ===
                        "failed"
                ).length;


            const unconfirmed =
                results.filter(
                    result =>
                        result.status ===
                        "unconfirmed"
                ).length;


            const confirmed =
                stored +
                duplicates;


            if(
                failed === 0 &&
                unconfirmed === 0
            ){

                setGlobalStatus(
                    confirmed === 1
                        ? "1 raport a fost confirmat."
                        : `${confirmed} rapoarte au fost confirmate.`,
                    "success"
                );

            }
            else{

                const parts =
                    [];


                if(confirmed){

                    parts.push(
                        `${confirmed} confirmate`
                    );

                }


                if(unconfirmed){

                    parts.push(
                        `${unconfirmed} neconfirmate`
                    );

                }


                if(failed){

                    parts.push(
                        `${failed} cu eroare`
                    );

                }


                setGlobalStatus(
                    `Retrimitere terminată: ${parts.join(", ")}.`,
                    (
                        failed
                            ? "error"
                            : "warning"
                    )
                );

            }

        }
        catch(error){

            console.error(
                "[RapoarteNetrimise]",
                error
            );


            setGlobalStatus(
                error.message ||
                "Rapoartele nu au putut fi retransmise.",
                "error"
            );

        }
        finally{

            state.retryingAll =
                false;


            scheduleRender(
                500
            );

        }

    }


    /* ==================================================================
       CLICK HANDLER
    ================================================================== */

    function handleClick(
        event
    ){

        /* --------------------------------------------------------------
           UN SINGUR RAPORT
        -------------------------------------------------------------- */

        const retryButton =
            event.target.closest(
                "[data-retry-report]"
            );


        if(retryButton){

            event.preventDefault();


            const id =
                retryButton.dataset
                    .retryReport;


            if(!id){
                return;
            }


            retryButton.disabled =
                true;


            retryReport(
                id
            ).catch(
                () => {

                    /*
                       Mesajul a fost deja afișat
                       de retryReport().
                    */

                }
            );


            return;

        }


        /* --------------------------------------------------------------
           TOATE RAPOARTELE
        -------------------------------------------------------------- */

        const retryAllButton =
            event.target.closest(
                SELECTORS.retryAll
            );


        if(retryAllButton){

            event.preventDefault();


            retryAll();

        }

    }


    /* ==================================================================
       EVENIMENTE GOOGLE SHEETS
    ================================================================== */

    function addSubmissionListeners(){

        /*
           Coada s-a modificat.
        */

        document.addEventListener(
            "laborator:submission-queue-changed",
            () => {

                scheduleRender();

            }
        );


        /*
           Trimitere confirmată.
        */

        document.addEventListener(
            "laborator:submission-sent",
            () => {

                scheduleRender(
                    300
                );

            }
        );


        /*
           Trimitere neconfirmată.
        */

        document.addEventListener(
            "laborator:submission-unconfirmed",
            () => {

                scheduleRender(
                    200
                );

            }
        );


        /*
           Trimitere eșuată.
        */

        document.addEventListener(
            "laborator:submission-failed",
            () => {

                scheduleRender(
                    200
                );

            }
        );


        /*
           Modulul Google Sheets este gata.
        */

        document.addEventListener(
            "laborator:google-sheets-ready",
            () => {

                scheduleRender();

            }
        );

    }


    /* ==================================================================
       EVENIMENTE BROWSER
    ================================================================== */

    function addBrowserListeners(){

        /* --------------------------------------------------------------
           CLICK
        -------------------------------------------------------------- */

        document.addEventListener(
            "click",
            handleClick
        );


        /* --------------------------------------------------------------
           LOCAL STORAGE MODIFICAT DIN ALTĂ FILĂ
        -------------------------------------------------------------- */

        globalThis.addEventListener(
            "storage",
            event => {

                if(
                    event.key ===
                    getStorageKey()
                ){

                    scheduleRender();

                }

            }
        );


        /* --------------------------------------------------------------
           INTERNET DISPONIBIL
        -------------------------------------------------------------- */

        globalThis.addEventListener(
            "online",
            () => {

                setGlobalStatus(
                    "Conexiunea la internet este disponibilă. Rapoartele pot fi retransmise.",
                    "info"
                );


                scheduleRender(
                    500
                );

            }
        );


        /* --------------------------------------------------------------
           INTERNET INDISPONIBIL
        -------------------------------------------------------------- */

        globalThis.addEventListener(
            "offline",
            () => {

                setGlobalStatus(
                    "Dispozitivul este offline. Rapoartele sunt păstrate local.",
                    "warning"
                );


                scheduleRender();

            }
        );


        /* --------------------------------------------------------------
           REVENIRE PE PAGINĂ
        -------------------------------------------------------------- */

        document.addEventListener(
            "visibilitychange",
            () => {

                if(
                    document.visibilityState ===
                    "visible"
                ){

                    scheduleRender();

                }

            }
        );


        /*
           Important mai ales pe telefon:
           când pagina revine din BFCache.
        */

        globalThis.addEventListener(
            "pageshow",
            () => {

                scheduleRender();

            }
        );

    }


    /* ==================================================================
       INIȚIALIZARE
    ================================================================== */

    function init(){

        if(
            state.initialized
        ){

            render();


            return;

        }


        state.initialized =
            true;


        addSubmissionListeners();


        addBrowserListeners();


        render();

    }


    /* ==================================================================
       API PUBLIC
    ================================================================== */

    globalThis
        .LaboratorRapoarteNetrimise =
        Object.freeze({

            init,

            render,

            retryReport,

            retryAll,

            getReports:
                () => [
                    ...getReports()
                ],

            getCount:
                () =>
                    getReports()
                        .length,

            version:
                MODULE_VERSION

        });


    /* ==================================================================
       PORNIRE AUTOMATĂ
    ================================================================== */

    if(
        document.readyState ===
        "loading"
    ){

        document.addEventListener(
            "DOMContentLoaded",
            init,
            {
                once:true
            }
        );

    }
    else{

        init();

    }

})();
