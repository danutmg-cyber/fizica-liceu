/* ======================================================================
   FIZICA-LICEU
   google-sheets.js

   Modul comun pentru transmiterea rezultatelor experimentelor
   către Google Apps Script / Google Sheets.

   FUNCȚIONALITĂȚI:

   1. Construiește payload-ul standard al laboratorului.
   2. Fiecare raport are un reportId unic.
   3. Salvează raportul în localStorage ÎNAINTE de trimitere.
   4. Retrimiterea folosește EXACT payload-ul salvat.
   5. Primește confirmare explicită de la Google Apps Script.
   6. Recunoaște:
        - stored
        - duplicate
        - submission-error
   7. Un raport este șters din coada locală numai după
      confirmare explicită de la server.
   8. Dacă nu vine confirmarea:
        -> status = unconfirmed
        -> raportul rămâne pe dispozitiv.
   9. Dacă apare o eroare:
        -> status = pending
        -> raportul rămâne pe dispozitiv.
   10. La revenirea internetului sunt retrimise automat
       numai rapoartele "pending".
   11. Rapoartele "unconfirmed" se retrimit manual.
   12. Modulul poate fi folosit de clasele VI-XII.

   API PUBLIC:

   window.LaboratorGoogleSheets.init()

   window.LaboratorGoogleSheets.buildPayload()

   window.LaboratorGoogleSheets.savePending(payload)

   window.LaboratorGoogleSheets.submit(payload)

   window.LaboratorGoogleSheets.retryReport(reportId)

   window.LaboratorGoogleSheets.retryPending()

   window.LaboratorGoogleSheets.getPendingReports()

   window.LaboratorGoogleSheets.getQueueSummary()

   EVENIMENTE:

   laborator:google-sheets-ready
   laborator:submission-start
   laborator:submission-sent
   laborator:submission-unconfirmed
   laborator:submission-failed
   laborator:submission-queue-changed
   ====================================================================== */

(() => {

    "use strict";


    /* ==================================================================
       CONSTANTE
    ================================================================== */

    const CURRENT_SCRIPT_URL =
        document.currentScript?.src ||
        document.baseURI;


    const DEFAULT_CONFIG_URL =
        new URL(
            "../data/configurare-generala.json",
            CURRENT_SCRIPT_URL
        ).href;


    /*
       Această cheie trebuie să fie aceeași cu cea utilizată
       ulterior de rapoarte-netrimise.js.
    */

    const DEFAULT_QUEUE_KEY =
        "fizica-laborator-rezultate-netrimise";


    /*
       Păstrăm local ID-urile confirmate de server.
       Este doar o protecție suplimentară.

       Protecția principală împotriva duplicatelor
       este realizată în Google Apps Script.
    */

    const SENT_REPORTS_KEY =
        "fizica-laborator-rapoarte-confirmate";


    const MAX_SENT_REPORT_IDS =
        300;


    /*
       Trebuie să fie identic cu:

       APP_CONFIG.CONFIRMATION_SOURCE

       din Code.gs.
    */

    const SERVER_MESSAGE_SOURCE =
        "fizica-laborator-google-sheets";


    const CLIENT_VERSION =
        "3.0.0";


    /* ==================================================================
       STARE INTERNĂ
    ================================================================== */

    const state = {

        initialized:false,

        initializationPromise:null,

        listenersAdded:false,

        generalConfig:null,

        submissionConfig:null,

        endpoint:"",

        submittingReportIds:
            new Set(),

        latestEvaluation:null,

        latestEquipment:null,

        latestNotebook:null,

        latestSafety:null,

        latestMonitoring:null,

        latestReport:null

    };


    /* ==================================================================
       UTILITARE GENERALE
    ================================================================== */

    function clone(value){

        if(value === undefined){
            return undefined;
        }


        if(
            typeof globalThis
                .structuredClone ===
            "function"
        ){

            return globalThis
                .structuredClone(
                    value
                );

        }


        return JSON.parse(
            JSON.stringify(value)
        );

    }


    function normalize(value){

        return String(
            value ?? ""
        ).trim();

    }


    function isPlainObject(value){

        return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        );

    }


    function deepMerge(
        target,
        source
    ){

        if(!isPlainObject(source)){

            return clone(source);

        }


        const output =
            isPlainObject(target)
                ? clone(target)
                : {};


        for(
            const [key,value]
            of Object.entries(source)
        ){

            if(
                isPlainObject(value) &&
                isPlainObject(output[key])
            ){

                output[key] =
                    deepMerge(
                        output[key],
                        value
                    );

            }
            else{

                output[key] =
                    clone(value);

            }

        }


        return output;

    }


    function createId(
        prefix="RAP"
    ){

        if(
            globalThis.crypto
                ?.randomUUID
        ){

            return (
                prefix +
                "-" +
                globalThis.crypto
                    .randomUUID()
            );

        }


        const timestamp =
            Date.now()
                .toString(36)
                .toUpperCase();


        const randomPart =
            Math.random()
                .toString(36)
                .slice(2,10)
                .toUpperCase();


        return (
            prefix +
            "-" +
            timestamp +
            "-" +
            randomPart
        );

    }


    function wait(
        milliseconds
    ){

        return new Promise(
            resolve => {

                globalThis.setTimeout(
                    resolve,
                    milliseconds
                );

            }
        );

    }


    function dispatch(
        eventName,
        detail={}
    ){

        document.dispatchEvent(

            new CustomEvent(
                eventName,
                {
                    detail:
                        clone(detail)
                }
            )

        );

    }


    /* ==================================================================
       LOCAL STORAGE
    ================================================================== */

    function safeStorageGet(
        key,
        fallback
    ){

        try{

            const raw =
                globalThis.localStorage
                    ?.getItem(key);


            if(!raw){
                return fallback;
            }


            return JSON.parse(raw);

        }
        catch(error){

            console.warn(
                "[LaboratorGoogleSheets] Nu s-au putut citi datele locale.",
                error
            );


            return fallback;

        }

    }


    function safeStorageSet(
        key,
        value
    ){

        try{

            globalThis.localStorage
                ?.setItem(
                    key,
                    JSON.stringify(value)
                );


            return true;

        }
        catch(error){

            console.warn(
                "[LaboratorGoogleSheets] Nu s-au putut salva datele local.",
                error
            );


            return false;

        }

    }


    /* ==================================================================
       CONFIGURARE
    ================================================================== */

    async function loadGeneralConfig(
        url=DEFAULT_CONFIG_URL
    ){

        if(
            globalThis
                .LAB_GENERAL_CONFIG
        ){

            return globalThis
                .LAB_GENERAL_CONFIG;

        }


        const response =
            await fetch(
                url,
                {
                    cache:"no-cache"
                }
            );


        if(!response.ok){

            throw new Error(
                "Configurarea generală nu a putut fi încărcată. " +
                `HTTP ${response.status}.`
            );

        }


        const configuration =
            await response.json();


        globalThis
            .LAB_GENERAL_CONFIG =
            configuration;


        return configuration;

    }


    function validateEndpoint(
        value
    ){

        const normalizedValue =
            normalize(value);


        if(!normalizedValue){

            throw new Error(
                "Adresa Google Apps Script nu este configurată."
            );

        }


        let url;


        try{

            url =
                new URL(
                    normalizedValue
                );

        }
        catch(error){

            throw new Error(
                "Adresa Google Apps Script nu are un format valid."
            );

        }


        const validProtocol =
            url.protocol ===
            "https:";


        const validHost =
            url.hostname ===
            "script.google.com";


        const validPath =
            /^\/macros\/s\/[^/]+\/exec\/?$/
                .test(
                    url.pathname
                );


        if(
            !validProtocol ||
            !validHost ||
            !validPath
        ){

            throw new Error(
                "Adresa Google Apps Script trebuie să fie URL-ul deployment-ului care se termină în /exec."
            );

        }


        return url.href;

    }


    /* ==================================================================
       CHEIA COZII LOCALE
    ================================================================== */

    function queueKey(){

        return (
            state.submissionConfig
                ?.localBackupKey ||
            DEFAULT_QUEUE_KEY
        );

    }


    /* ==================================================================
       NORMALIZARE ELEMENT DIN COADĂ
    ================================================================== */

    function normalizeQueueItem(
        item
    ){

        if(
            !item ||
            !item.reportId ||
            !item.payload
        ){

            return null;

        }


        const now =
            new Date()
                .toISOString();


        return {

            version:
                Number(
                    item.version ||
                    1
                ),

            reportId:
                String(
                    item.reportId
                ),

            payload:
                clone(
                    item.payload
                ),

            status:
                item.status ||
                "pending",

            queuedAt:
                item.queuedAt ||
                now,

            updatedAt:
                item.updatedAt ||
                item.queuedAt ||
                now,

            attempts:
                Number(
                    item.attempts ||
                    0
                ),

            lastAttemptAt:
                item.lastAttemptAt ||
                null,

            lastError:
                item.lastError ||
                "",

            lastTransport:
                item.lastTransport ||
                null

        };

    }


    /* ==================================================================
       CITIREA COZII
    ================================================================== */

    function readQueue(){

        const stored =
            safeStorageGet(
                queueKey(),
                []
            );


        if(
            !Array.isArray(stored)
        ){

            return [];

        }


        return stored
            .map(
                normalizeQueueItem
            )
            .filter(Boolean);

    }


    /* ==================================================================
       REZUMAT COADĂ
    ================================================================== */

    function queueSummary(
        queue=readQueue()
    ){

        return {

            total:
                queue.length,

            pending:
                queue.filter(
                    item =>
                        item.status ===
                        "pending"
                ).length,

            unconfirmed:
                queue.filter(
                    item =>
                        item.status ===
                        "unconfirmed"
                ).length

        };

    }


    /* ==================================================================
       SCRIEREA COZII
    ================================================================== */

    function writeQueue(
        queue
    ){

        const success =
            safeStorageSet(
                queueKey(),
                queue
            );


        if(success){

            dispatch(
                "laborator:submission-queue-changed",
                queueSummary(queue)
            );

        }


        return success;

    }


    /* ==================================================================
       INTRODUCERE RAPORT ÎN COADĂ

       IMPORTANT:
       dacă raportul există deja, payload-ul existent este păstrat.

       Retrimiterea trebuie să utilizeze EXACT raportul original.
    ================================================================== */

    function ensureQueued(
        payload,
        options={}
    ){

        const queue =
            readQueue();


        const index =
            queue.findIndex(
                item =>
                    item.reportId ===
                    payload.reportId
            );


        const now =
            new Date()
                .toISOString();


        if(index >= 0){

            const existing =
                queue[index];


            const updated = {

                ...existing,

                version:3,

                payload:
                    options.replacePayload
                        ? clone(payload)
                        : clone(
                            existing.payload
                        ),

                status:
                    options.status ||
                    existing.status ||
                    "pending",

                updatedAt:
                    now

            };


            if(
                options.lastError !==
                undefined
            ){

                updated.lastError =
                    options.lastError;

            }


            if(
                options.lastTransport !==
                undefined
            ){

                updated.lastTransport =
                    options.lastTransport;

            }


            queue[index] =
                updated;


            writeQueue(
                queue
            );


            return clone(
                updated
            );

        }


        const newItem = {

            version:3,

            reportId:
                payload.reportId,

            payload:
                clone(payload),

            status:
                options.status ||
                "pending",

            queuedAt:
                now,

            updatedAt:
                now,

            attempts:
                0,

            lastAttemptAt:
                null,

            lastError:
                options.lastError ||
                "",

            lastTransport:
                options.lastTransport ||
                null

        };


        queue.push(
            newItem
        );


        writeQueue(
            queue
        );


        return clone(
            newItem
        );

    }


    /* ==================================================================
       ACTUALIZARE ELEMENT DIN COADĂ
    ================================================================== */

    function updateQueueItem(
        reportId,
        changes={}
    ){

        const queue =
            readQueue();


        const index =
            queue.findIndex(
                item =>
                    item.reportId ===
                    reportId
            );


        if(index < 0){
            return null;
        }


        queue[index] = {

            ...queue[index],

            ...clone(changes),

            updatedAt:
                new Date()
                    .toISOString()

        };


        writeQueue(
            queue
        );


        return clone(
            queue[index]
        );

    }


    /* ==================================================================
       ÎNREGISTRAREA UNEI TENTATIVE
    ================================================================== */

    function markQueueAttempt(
        reportId
    ){

        const queue =
            readQueue();


        const index =
            queue.findIndex(
                item =>
                    item.reportId ===
                    reportId
            );


        if(index < 0){
            return;
        }


        const now =
            new Date()
                .toISOString();


        queue[index] = {

            ...queue[index],

            attempts:
                Number(
                    queue[index]
                        .attempts ||
                    0
                ) + 1,

            lastAttemptAt:
                now,

            updatedAt:
                now

        };


        writeQueue(
            queue
        );

    }


    /* ==================================================================
       ȘTERGERE RAPORT DIN COADĂ
    ================================================================== */

    function removeFromQueue(
        reportId
    ){

        const queue =
            readQueue();


        const updated =
            queue.filter(
                item =>
                    item.reportId !==
                    reportId
            );


        if(
            updated.length ===
            queue.length
        ){

            return false;

        }


        writeQueue(
            updated
        );


        return true;

    }


    /* ==================================================================
       OBȚINERE RAPORT LOCAL
    ================================================================== */

    function getPendingReport(
        reportId
    ){

        return (
            readQueue()
                .find(
                    item =>
                        item.reportId ===
                        reportId
                ) ||
            null
        );

    }


    /* ==================================================================
       LISTA ID-URILOR CONFIRMATE
    ================================================================== */

    function readSentReportIds(){

        const stored =
            safeStorageGet(
                SENT_REPORTS_KEY,
                []
            );


        return Array.isArray(
            stored
        )
            ? stored
            : [];

    }


    function hasBeenSent(
        reportId
    ){

        return readSentReportIds()
            .includes(
                reportId
            );

    }


    function rememberSent(
        reportId
    ){

        const existing =
            readSentReportIds();


        const updated = [

            reportId,

            ...existing.filter(
                id =>
                    id !==
                    reportId
            )

        ].slice(
            0,
            MAX_SENT_REPORT_IDS
        );


        safeStorageSet(
            SENT_REPORTS_KEY,
            updated
        );

    }


    /* ==================================================================
       CITIREA STĂRII LABORATORULUI
    ================================================================== */

    function readGlobalState(){

        const session =
            clone(

                globalThis
                    .LAB_SESSION ||

                globalThis
                    .LaboratorSesiune
                    ?.getState?.() ||

                {}

            );


        const experiment =
            clone(

                globalThis
                    .LAB_EXPERIMENT_CONFIG ||

                {}

            );


        const equipment =
            clone(

                state.latestEquipment ||

                globalThis
                    .LaboratorEchipamente
                    ?.getState?.() ||

                {}

            );


        const evaluation =
            clone(

                state.latestEvaluation ||

                globalThis
                    .LaboratorEvaluare
                    ?.getResult?.() ||

                {}

            );


        const notebook =
            clone(

                state.latestNotebook ||

                globalThis
                    .LaboratorCaiet
                    ?.getState?.() ||

                globalThis
                    .LAB_NOTEBOOK_STATE ||

                {}

            );


        const safety =
            clone(

                state.latestSafety ||

                globalThis
                    .LaboratorSecuritate
                    ?.getState?.() ||

                globalThis
                    .LAB_SAFETY_STATE ||

                {}

            );


        const monitoring =
            clone(

                state.latestMonitoring ||

                globalThis
                    .LaboratorMonitorizare
                    ?.getState?.() ||

                globalThis
                    .LAB_MONITORING ||

                {}

            );


        const report =
            clone(

                state.latestReport ||

                globalThis
                    .LaboratorRaport
                    ?.getData?.() ||

                {}

            );


        return {

            session,

            experiment,

            equipment,

            evaluation,

            notebook,

            safety,

            monitoring,

            report

        };

    }


    /* ==================================================================
       CONSTRUIREA PAYLOAD-ULUI
    ================================================================== */

    function buildPayload(
        overrides={}
    ){

        const source =
            readGlobalState();


        const currentTime =
            new Date();


        const sessionStarted =

            source.session
                .startedAt ||

            source.session
                .sessionStarted ||

            null;


        const finishTime =

            source.evaluation
                .finishedAt ||

            source.report
                .finishedAt ||

            source.session
                .finishedAt ||

            currentTime
                .toISOString();


        const startedTimestamp =
            Date.parse(
                sessionStarted
            );


        const finishedTimestamp =
            Date.parse(
                finishTime
            );


        const durationSeconds =

            sessionStarted &&

            Number.isFinite(
                startedTimestamp
            ) &&

            Number.isFinite(
                finishedTimestamp
            )

                ? Math.max(
                    0,
                    Math.round(
                        (
                            finishedTimestamp -
                            startedTimestamp
                        ) /
                        1000
                    )
                )

                : null;


        /*
           reportId poate veni din:

           1. overrides
           2. raport
           3. sesiune

           dacă nu există, îl generăm.
        */

        const reportId =

            normalize(

                overrides.reportId ||

                source.report
                    .reportId ||

                source.report
                    .id ||

                source.session
                    .reportId

            ) ||

            createId(
                "RAP"
            );


        /*
           Număr catalog.
        */

        const rawCatalogNumber =

            source.session
                .catalogNumber ??

            source.session
                .studentCatalogNumber ??

            null;


        let catalogNumber =
            null;


        if(
            rawCatalogNumber !==
                null &&
            rawCatalogNumber !==
                ""
        ){

            const numeric =
                Number(
                    rawCatalogNumber
                );


            catalogNumber =
                Number.isFinite(numeric)
                    ? numeric
                    : normalize(
                        rawCatalogNumber
                    );

        }


        /* --------------------------------------------------------------
           PAYLOAD STANDARD
        -------------------------------------------------------------- */

        const basePayload = {

            schemaVersion:
                "1.1.0",


            reportId:
                reportId,


            submittedAt:
                currentTime
                    .toISOString(),


            application:{

                name:

                    state.generalConfig
                        ?.application
                        ?.name ||

                    "Laborator virtual de fizică",


                version:

                    state.generalConfig
                        ?.schemaVersion ||

                    "1.0.0",


                clientVersion:
                    CLIENT_VERSION,


                pageUrl:

                    globalThis.location
                        ?.href ||

                    "",


                userAgent:

                    globalThis.navigator
                        ?.userAgent ||

                    ""

            },


            student:{

                name:
                    normalize(

                        source.session
                            .studentName ||

                        source.session
                            .name

                    ),


                className:
                    normalize(

                        source.session
                            .studentClass ||

                        source.session
                            .className

                    ),


                catalogNumber:
                    catalogNumber,


                identityConfirmed:
                    Boolean(
                        source.session
                            .identityConfirmed
                    )

            },


            experiment:{

                id:
                    normalize(

                        source.experiment
                            .id ||

                        source.experiment
                            .slug

                    ),


                code:
                    normalize(

                        source.experiment
                            .code ||

                        source.experiment
                            .experimentCode

                    ),


                title:
                    normalize(

                        source.experiment
                            .title ||

                        source.experiment
                            .experimentTitle

                    ),


                classLevel:
                    normalize(

                        source.experiment
                            .classLevel ||

                        source.experiment
                            .grade

                    ),


                domain:
                    normalize(

                        source.experiment
                            .domain ||

                        source.experiment
                            .physicsDomain

                    ),


                risks:
                    Array.isArray(
                        source.experiment
                            .risks
                    )
                        ? clone(
                            source.experiment
                                .risks
                        )
                        : [],


                dataSetId:

                    source.session
                        .dataSetId ||

                    source.experiment
                        .dataSetId ||

                    source.notebook
                        .dataSetId ||

                    null,


                generatedData:
                    clone(

                        source.experiment
                            .generatedData ||

                        {}

                    )

            },


            session:{

                sessionId:
                    normalize(

                        source.session
                            .sessionId ||

                        source.session
                            .id

                    ),


                startedAt:
                    sessionStarted,


                finishedAt:
                    finishTime,


                durationSeconds:
                    durationSeconds,


                dateDisplay:
                    normalize(

                        source.session
                            .experimentDate ||

                        source.session
                            .dateDisplay

                    )

            },


            safety:
                clone(
                    source.safety
                ),


            equipment:
                clone(
                    source.equipment
                ),


            notebook:
                clone(
                    source.notebook
                ),


            measurements:
                clone(

                    source.notebook
                        .measurements ||

                    source.report
                        .measurements ||

                    []

                ),


            calculations:
                clone(

                    source.notebook
                        .calculations ||

                    source.report
                        .calculations ||

                    {}

                ),


            comparison:
                clone(

                    source.notebook
                        .comparison ||

                    source.report
                        .comparison ||

                    {}

                ),


            evaluation:
                clone(
                    source.evaluation
                ),


            monitoring:
                clone(
                    source.monitoring
                ),


            report:{

                ...clone(
                    source.report
                ),

                reportId:
                    reportId

            }

        };


        /*
           Permite experimentului să suprascrie / adauge
           anumite date.
        */

        const merged =
            deepMerge(
                basePayload,
                clone(overrides)
            );


        /*
           Menținem obligatoriu același reportId.
        */

        merged.reportId =
            normalize(
                merged.reportId
            ) ||
            reportId;


        merged.report = {

            ...(
                isPlainObject(
                    merged.report
                )
                    ? merged.report
                    : {}
            ),

            reportId:
                merged.reportId

        };


        return merged;

    }


    /* ==================================================================
       VALIDAREA PAYLOAD-ULUI
    ================================================================== */

    function validatePayload(
        payload
    ){

        const errors =
            [];


        if(
            !normalize(
                payload
                    ?.reportId
            )
        ){

            errors.push(
                "lipsește ID-ul raportului"
            );

        }


        if(
            !normalize(
                payload
                    ?.student
                    ?.name
            )
        ){

            errors.push(
                "lipsește numele elevului"
            );

        }


        if(
            !normalize(
                payload
                    ?.student
                    ?.className
            )
        ){

            errors.push(
                "lipsește clasa elevului"
            );

        }


        if(
            !normalize(
                payload
                    ?.experiment
                    ?.id
            )
        ){

            errors.push(
                "lipsește ID-ul experimentului"
            );

        }


        if(
            !normalize(
                payload
                    ?.experiment
                    ?.title
            )
        ){

            errors.push(
                "lipsește titlul experimentului"
            );

        }


        if(
            !normalize(
                payload
                    ?.session
                    ?.sessionId
            )
        ){

            errors.push(
                "lipsește ID-ul sesiunii"
            );

        }


        if(errors.length){

            throw new Error(
                "Raportul nu poate fi trimis: " +
                errors.join(", ") +
                "."
            );

        }


        return payload;

    }


    /* ==================================================================
       STATUS VIZUAL
    ================================================================== */

    function updateStatus(
        message,
        type=""
    ){

        const selectors = [

            "[data-submission-status]",

            "[data-report-submission-status]"

        ];


        for(
            const selector
            of selectors
        ){

            const elements =
                document
                    .querySelectorAll(
                        selector
                    );


            for(
                const element
                of elements
            ){

                element.textContent =
                    message;


                element.classList.remove(

                    "is-sending",

                    "is-error",

                    "is-success",

                    "is-pending"

                );


                if(type){

                    element.classList.add(
                        `is-${type}`
                    );

                }

            }

        }

    }


    /* ==================================================================
       ORIGINEA MESAJULUI SERVERULUI
    ================================================================== */

    function allowedServerOrigin(
        origin
    ){

        try{

            const url =
                new URL(
                    origin
                );


            if(
                url.protocol !==
                "https:"
            ){

                return false;

            }


            return (

                url.hostname ===
                    "script.google.com" ||

                url.hostname ===
                    "script.googleusercontent.com" ||

                url.hostname.endsWith(
                    ".googleusercontent.com"
                )

            );

        }
        catch(error){

            return false;

        }

    }


    /* ==================================================================
       PARSAREA postMessage
    ================================================================== */

    function parseMessageData(
        value
    ){

        if(
            typeof value ===
            "string"
        ){

            try{

                return JSON.parse(
                    value
                );

            }
            catch(error){

                return null;

            }

        }


        if(
            isPlainObject(value)
        ){

            return value;

        }


        return null;

    }


    /* ==================================================================
       VERIFICAREA MESAJULUI SERVERULUI
    ================================================================== */

    function isMessageForReport(
        data,
        reportId
    ){

        if(!data){
            return false;
        }


        if(
            data.source !==
            SERVER_MESSAGE_SOURCE
        ){

            return false;
        }


        if(
            String(
                data.reportId ||
                ""
            ) !==
            String(
                reportId
            )
        ){

            return false;
        }


        return true;

    }


    /* ==================================================================
       TRANSPORTUL

       Google Apps Script este apelat prin formular POST într-un iframe
       ascuns.

       Serverul trebuie să trimită confirmarea cu postMessage().
    ================================================================== */

    function postPayload(
        payload
    ){

        return new Promise(
            (
                resolve,
                reject
            ) => {

                const frameName =
                    "lab-google-response-" +
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .slice(2);


                const iframe =
                    document.createElement(
                        "iframe"
                    );


                iframe.name =
                    frameName;


                iframe.hidden =
                    true;


                iframe.setAttribute(
                    "aria-hidden",
                    "true"
                );


                const form =
                    document.createElement(
                        "form"
                    );


                form.method =
                    "POST";


                form.action =
                    state.endpoint;


                form.target =
                    frameName;


                form.hidden =
                    true;


                form.acceptCharset =
                    "UTF-8";


                /* ------------------------------------------------------
                   PAYLOAD
                ------------------------------------------------------ */

                const payloadInput =
                    document.createElement(
                        "input"
                    );


                payloadInput.type =
                    "hidden";


                payloadInput.name =
                    "payload";


                payloadInput.value =
                    JSON.stringify(
                        payload
                    );


                /* ------------------------------------------------------
                   reportId separat
                ------------------------------------------------------ */

                const reportIdInput =
                    document.createElement(
                        "input"
                    );


                reportIdInput.type =
                    "hidden";


                reportIdInput.name =
                    "reportId";


                reportIdInput.value =
                    payload.reportId;


                /* ------------------------------------------------------
                   protocol client
                ------------------------------------------------------ */

                const protocolInput =
                    document.createElement(
                        "input"
                    );


                protocolInput.type =
                    "hidden";


                protocolInput.name =
                    "clientProtocol";


                protocolInput.value =
                    "3";


                form.append(

                    payloadInput,

                    reportIdInput,

                    protocolInput

                );


                document.body.append(
                    iframe
                );


                document.body.append(
                    form
                );


                let finished =
                    false;


                const timeoutMilliseconds =
                    Math.max(

                        10000,

                        Number(
                            state.submissionConfig
                                ?.timeoutMilliseconds ||
                            20000
                        )

                    );


                let timeoutId =
                    null;


                function cleanup(){

                    globalThis.removeEventListener(
                        "message",
                        onMessage
                    );


                    if(timeoutId){

                        globalThis.clearTimeout(
                            timeoutId
                        );

                    }


                    /*
                       Întârziem puțin eliminarea iframe-ului
                       pentru unele browsere mobile.
                    */

                    globalThis.setTimeout(
                        () => {

                            try{
                                form.remove();
                            }
                            catch(error){
                                // nimic
                            }


                            try{
                                iframe.remove();
                            }
                            catch(error){
                                // nimic
                            }

                        },
                        400
                    );

                }


                function finishSuccess(
                    result
                ){

                    if(finished){
                        return;
                    }


                    finished =
                        true;


                    cleanup();


                    resolve(
                        result
                    );

                }


                function finishError(
                    error
                ){

                    if(finished){
                        return;
                    }


                    finished =
                        true;


                    cleanup();


                    reject(
                        error
                    );

                }


                /* ------------------------------------------------------
                   PRIMIRE CONFIRMARE SERVER
                ------------------------------------------------------ */

                function onMessage(
                    event
                ){

                    /*
                       Mesajul trebuie să vină chiar din iframe-ul
                       creat pentru această cerere.
                    */

                    if(
                        event.source !==
                        iframe.contentWindow
                    ){

                        return;

                    }


                    if(
                        !allowedServerOrigin(
                            event.origin
                        )
                    ){

                        return;

                    }


                    const data =
                        parseMessageData(
                            event.data
                        );


                    if(
                        !isMessageForReport(
                            data,
                            payload.reportId
                        )
                    ){

                        return;

                    }


                    /* --------------------------------------------------
                       EROARE CONFIRMATĂ DE SERVER
                    -------------------------------------------------- */

                    if(
                        data.type ===
                            "submission-error" ||

                        data.status ===
                            "error" ||

                        data.ok ===
                            false
                    ){

                        const error =
                            new Error(

                                data.error ||

                                data.message ||

                                "Google Apps Script a respins raportul."

                            );


                        error.serverConfirmed =
                            true;


                        error.serverData =
                            clone(data);


                        finishError(
                            error
                        );


                        return;

                    }


                    /* --------------------------------------------------
                       RAPORT SALVAT
                    -------------------------------------------------- */

                    if(
                        data.type ===
                            "submission-confirmed" &&

                        data.status ===
                            "stored"
                    ){

                        finishSuccess({

                            ok:true,

                            confirmed:true,

                            status:"stored",

                            duplicate:false,

                            transport:
                                "postMessage",

                            serverData:
                                clone(data)

                        });


                        return;

                    }


                    /* --------------------------------------------------
                       RAPORT DUPLICAT
                    -------------------------------------------------- */

                    if(
                        data.type ===
                            "submission-confirmed" &&

                        data.status ===
                            "duplicate"
                    ){

                        finishSuccess({

                            ok:true,

                            confirmed:true,

                            status:"duplicate",

                            duplicate:true,

                            transport:
                                "postMessage",

                            serverData:
                                clone(data)

                        });

                    }

                }


                globalThis.addEventListener(
                    "message",
                    onMessage
                );


                /* ------------------------------------------------------
                   TIMEOUT

                   NU îl considerăm succes.

                   Raportul devine "unconfirmed" și rămâne local.
                ------------------------------------------------------ */

                timeoutId =
                    globalThis.setTimeout(
                        () => {

                            finishSuccess({

                                ok:true,

                                confirmed:false,

                                status:
                                    "unconfirmed",

                                duplicate:false,

                                transport:
                                    "confirmation-timeout"

                            });

                        },
                        timeoutMilliseconds
                    );


                /* ------------------------------------------------------
                   TRIMITEREA FORMULARULUI
                ------------------------------------------------------ */

                try{

                    form.submit();

                }
                catch(error){

                    finishError(
                        error
                    );

                }

            }
        );

    }


    /* ==================================================================
       TRIMITERE CU REÎNCERCĂRI TEHNICE

       Dacă serverul răspunde explicit cu o eroare,
       NU insistăm automat.

       Dacă transportul ajunge la timeout, rezultatul este
       "unconfirmed"; nu trimitem din nou automat.
    ================================================================== */

    async function sendWithRetries(
        payload
    ){

        const maximumRetries =
            Math.max(

                0,

                Number(
                    state.submissionConfig
                        ?.maximumRetries ||
                    0
                )

            );


        const retryDelay =
            Math.max(

                250,

                Number(
                    state.submissionConfig
                        ?.retryDelayMilliseconds ||
                    1200
                )

            );


        let lastError =
            null;


        for(
            let attempt=0;
            attempt<=maximumRetries;
            attempt+=1
        ){

            try{

                markQueueAttempt(
                    payload.reportId
                );


                const response =
                    await postPayload(
                        payload
                    );


                /*
                   stored / duplicate / unconfirmed

                   În toate aceste cazuri nu mai facem
                   alt POST automat imediat.
                */

                return {

                    response,

                    attempts:
                        attempt + 1

                };

            }
            catch(error){

                lastError =
                    error;


                /*
                   Dacă Google Apps Script ne-a răspuns
                   explicit cu o eroare, retry-ul automat
                   nu este util.
                */

                if(
                    error.serverConfirmed
                ){

                    throw error;

                }


                if(
                    attempt <
                    maximumRetries
                ){

                    await wait(

                        retryDelay *
                        (
                            attempt + 1
                        )

                    );

                }

            }

        }


        throw (

            lastError ||

            new Error(
                "Raportul nu a putut fi transmis."
            )

        );

    }


    /* ==================================================================
       SALVARE LOCALĂ FĂRĂ TRIMITERE

       Recomandat imediat după finalizarea experimentului.
    ================================================================== */

    async function savePending(
        payloadOrOverrides=null
    ){

        if(
            !state.initialized
        ){

            await init();

        }


        const looksLikeCompletePayload =
            Boolean(

                payloadOrOverrides
                    ?.schemaVersion &&

                payloadOrOverrides
                    ?.student &&

                payloadOrOverrides
                    ?.experiment

            );


        const payload =
            validatePayload(

                looksLikeCompletePayload

                    ? clone(
                        payloadOrOverrides
                    )

                    : buildPayload(
                        payloadOrOverrides ||
                        {}
                    )

            );


        const queued =
            ensureQueued(
                payload,
                {
                    status:
                        "pending",

                    lastError:
                        ""
                }
            );


        return clone(
            queued.payload
        );

    }


    /* ==================================================================
       TRIMITEREA RAPORTULUI
    ================================================================== */

    async function submit(
        payloadOrOverrides=null,
        options={}
    ){

        if(
            !state.initialized
        ){

            const initialized =
                await init();


            if(!initialized){

                throw new Error(
                    "Modulul Google Sheets nu a putut fi inițializat."
                );

            }

        }


        if(
            !state.submissionConfig ||
            !state.endpoint
        ){

            throw new Error(
                "Conexiunea cu Google Sheets nu este configurată."
            );

        }


        if(
            state.submissionConfig
                .enabled ===
            false
        ){

            throw new Error(
                "Trimiterea rezultatelor este dezactivată."
            );

        }


        const looksLikeCompletePayload =
            Boolean(

                payloadOrOverrides
                    ?.schemaVersion &&

                payloadOrOverrides
                    ?.student &&

                payloadOrOverrides
                    ?.experiment

            );


        let payload =
            validatePayload(

                looksLikeCompletePayload

                    ? clone(
                        payloadOrOverrides
                    )

                    : buildPayload(
                        payloadOrOverrides ||
                        {}
                    )

            );


        const reportId =
            payload.reportId;


        /* --------------------------------------------------------------
           EVITĂ DUBLU CLICK
        -------------------------------------------------------------- */

        if(
            state.submittingReportIds
                .has(reportId)
        ){

            throw new Error(
                "Acest raport este deja în curs de trimitere."
            );

        }


        /* --------------------------------------------------------------
           RAPORT CONFIRMAT ANTERIOR
        -------------------------------------------------------------- */

        if(
            !options.force &&
            hasBeenSent(
                reportId
            )
        ){

            updateStatus(
                "Acest raport a fost deja înregistrat.",
                "success"
            );


            return {

                status:
                    "duplicate",

                reportId:
                    reportId,

                confirmed:
                    true,

                duplicate:
                    true

            };

        }


        /* --------------------------------------------------------------
           SALVARE LOCALĂ ÎNAINTE DE POST

           Acesta este pasul critic pentru telefoane.
        -------------------------------------------------------------- */

        if(
            state.submissionConfig
                .saveLocalBackup !==
            false
        ){

            const queued =
                ensureQueued(
                    payload,
                    {
                        status:
                            "pending"
                    }
                );


            /*
               Dacă exista deja în coadă,
               folosim payload-ul original.
            */

            payload =
                clone(
                    queued.payload
                );

        }


        state.submittingReportIds
            .add(
                reportId
            );


        updateStatus(

            state.submissionConfig
                .messages
                ?.sending ||

            "Datele se transmit către registrul clasei…",

            "sending"

        );


        dispatch(
            "laborator:submission-start",
            {
                reportId:
                    reportId
            }
        );


        try{

            /* ----------------------------------------------------------
               OFFLINE
            ---------------------------------------------------------- */

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


            const result =
                await sendWithRetries(
                    payload
                );


            const response =
                result.response;


            /* ----------------------------------------------------------
               STORED
            ---------------------------------------------------------- */

            if(
                response.confirmed &&
                response.status ===
                    "stored"
            ){

                rememberSent(
                    reportId
                );


                removeFromQueue(
                    reportId
                );


                const successMessage =

                    state.submissionConfig
                        .messages
                        ?.success ||

                    "Rezultatele au fost înregistrate cu succes.";


                updateStatus(
                    successMessage,
                    "success"
                );


                dispatch(
                    "laborator:submission-sent",
                    {

                        reportId:
                            reportId,

                        confirmed:
                            true,

                        duplicate:
                            false,

                        status:
                            "stored",

                        attempts:
                            result.attempts,

                        transport:
                            response.transport

                    }
                );


                return {

                    status:
                        "stored",

                    reportId:
                        reportId,

                    confirmed:
                        true,

                    duplicate:
                        false,

                    attempts:
                        result.attempts

                };

            }


            /* ----------------------------------------------------------
               DUPLICATE

               Raportul există deja pe server.
               Îl putem elimina în siguranță din coada locală.
            ---------------------------------------------------------- */

            if(
                response.confirmed &&
                response.status ===
                    "duplicate"
            ){

                rememberSent(
                    reportId
                );


                removeFromQueue(
                    reportId
                );


                updateStatus(
                    "Raportul exista deja în registru. Nu a fost creat un rând duplicat.",
                    "success"
                );


                dispatch(
                    "laborator:submission-sent",
                    {

                        reportId:
                            reportId,

                        confirmed:
                            true,

                        duplicate:
                            true,

                        status:
                            "duplicate",

                        attempts:
                            result.attempts,

                        transport:
                            response.transport

                    }
                );


                return {

                    status:
                        "duplicate",

                    reportId:
                        reportId,

                    confirmed:
                        true,

                    duplicate:
                        true,

                    attempts:
                        result.attempts

                };

            }


            /* ----------------------------------------------------------
               UNCONFIRMED

               Cererea a plecat, dar browserul nu a primit
               confirmarea de la server.

               NU ștergem raportul.
            ---------------------------------------------------------- */

            updateQueueItem(
                reportId,
                {

                    status:
                        "unconfirmed",

                    lastError:
                        "",

                    lastTransport:
                        response.transport ||
                        "confirmation-timeout"

                }
            );


            const unconfirmedMessage =
                "Datele au fost trimise, dar serverul nu a confirmat salvarea. " +
                "Raportul rămâne salvat pe acest dispozitiv și poate fi retransmis.";


            updateStatus(
                unconfirmedMessage,
                "pending"
            );


            dispatch(
                "laborator:submission-unconfirmed",
                {

                    reportId:
                        reportId,

                    confirmed:
                        false,

                    status:
                        "unconfirmed",

                    attempts:
                        result.attempts,

                    transport:
                        response.transport

                }
            );


            return {

                status:
                    "unconfirmed",

                reportId:
                    reportId,

                confirmed:
                    false,

                duplicate:
                    false,

                attempts:
                    result.attempts

            };

        }
        catch(error){

            /* ----------------------------------------------------------
               EROARE

               Raportul rămâne în coada locală.
            ---------------------------------------------------------- */

            if(
                state.submissionConfig
                    .saveLocalBackup !==
                false
            ){

                ensureQueued(
                    payload,
                    {

                        status:
                            "pending",

                        lastError:
                            error.message ||
                            "Eroare necunoscută"

                    }
                );

            }


            const failureMessage =

                state.submissionConfig
                    .messages
                    ?.failure ||

                "Rezultatele nu au putut fi transmise.";


            updateStatus(

                failureMessage +
                " Datele au rămas salvate pe acest dispozitiv.",

                "error"

            );


            dispatch(
                "laborator:submission-failed",
                {

                    reportId:
                        reportId,

                    message:
                        error.message ||
                        "Eroare necunoscută",

                    serverConfirmed:
                        Boolean(
                            error.serverConfirmed
                        )

                }
            );


            throw error;

        }
        finally{

            state.submittingReportIds
                .delete(
                    reportId
                );

        }

    }


    /* ==================================================================
       RETRIMITEREA UNUI RAPORT
    ================================================================== */

    async function retryReport(
        reportId
    ){

        if(
            !state.initialized
        ){

            await init();

        }


        const item =
            getPendingReport(
                reportId
            );


        if(!item){

            if(
                hasBeenSent(
                    reportId
                )
            ){

                return {

                    status:
                        "duplicate",

                    reportId:
                        reportId,

                    confirmed:
                        true,

                    duplicate:
                        true

                };

            }


            throw new Error(
                "Raportul nu mai există în memoria locală."
            );

        }


        /*
           IMPORTANT:

           NU reconstruim raportul.
           Folosim exact payload-ul salvat.
        */

        return submit(
            item.payload,
            {
                force:true
            }
        );

    }


    /* ==================================================================
       RETRIMITEREA COZII
    ================================================================== */

    async function retryPending(
        options={}
    ){

        if(
            !state.initialized
        ){

            await init();

        }


        if(
            globalThis.navigator &&
            globalThis.navigator
                .onLine ===
            false
        ){

            return [];

        }


        const includeUnconfirmed =
            Boolean(
                options.includeUnconfirmed
            );


        const queue =
            readQueue()
                .filter(
                    item =>

                        item.status ===
                            "pending" ||

                        (
                            includeUnconfirmed &&
                            item.status ===
                                "unconfirmed"
                        )
                );


        const results =
            [];


        for(
            const item
            of queue
        ){

            if(
                state.submittingReportIds
                    .has(
                        item.reportId
                    )
            ){

                continue;

            }


            try{

                const result =
                    await retryReport(
                        item.reportId
                    );


                results.push(
                    result
                );

            }
            catch(error){

                results.push({

                    status:
                        "failed",

                    reportId:
                        item.reportId,

                    message:
                        error.message

                });


                /*
                   Pentru retry automat ne oprim la prima
                   eroare de rețea/server.
                */

                if(
                    options.stopOnError !==
                    false
                ){

                    break;

                }

            }

        }


        return results;

    }


    /* ==================================================================
       MEMORAREA EVENIMENTELOR LABORATORULUI
    ================================================================== */

    function rememberEventData(
        event,
        stateProperty
    ){

        state[stateProperty] =
            clone(
                event.detail ||
                {}
            );

    }


    /* ==================================================================
       LISTENERS
    ================================================================== */

    function addEventListeners(){

        if(
            state.listenersAdded
        ){

            return;

        }


        state.listenersAdded =
            true;


        /* --------------------------------------------------------------
           EVALUARE
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:evaluation-complete",
            event => {

                rememberEventData(
                    event,
                    "latestEvaluation"
                );

            }
        );


        /* --------------------------------------------------------------
           ECHIPAMENTE
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:equipment-complete",
            event => {

                rememberEventData(
                    event,
                    "latestEquipment"
                );

            }
        );


        /* --------------------------------------------------------------
           CAIET
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:notebook-complete",
            event => {

                rememberEventData(
                    event,
                    "latestNotebook"
                );

            }
        );


        /* --------------------------------------------------------------
           SECURITATE
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:safety-complete",
            event => {

                rememberEventData(
                    event,
                    "latestSafety"
                );

            }
        );


        /* --------------------------------------------------------------
           MONITORIZARE
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:monitoring-update",
            event => {

                rememberEventData(
                    event,
                    "latestMonitoring"
                );

            }
        );


        /* --------------------------------------------------------------
           RAPORT FINAL

           Experimentul poate emite:
           laborator:report-ready

           Dacă raportul este complet, îl salvăm imediat local.
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:report-ready",
            event => {

                rememberEventData(
                    event,
                    "latestReport"
                );


                const reportId =
                    normalize(

                        event.detail
                            ?.reportId ||

                        event.detail
                            ?.id

                    );


                if(!reportId){
                    return;
                }


                try{

                    const payload =
                        validatePayload(

                            buildPayload({
                                reportId:
                                    reportId
                            })

                        );


                    ensureQueued(
                        payload,
                        {
                            status:
                                "pending"
                        }
                    );

                }
                catch(error){

                    /*
                       Nu blocăm experimentul dacă raportul încă
                       nu este complet în acest moment.
                    */

                    console.warn(
                        "[LaboratorGoogleSheets] Raportul nu a putut fi salvat încă.",
                        error
                    );

                }

            }
        );


        /* --------------------------------------------------------------
           RETRY PRIN EVENIMENT
        -------------------------------------------------------------- */

        document.addEventListener(
            "laborator:submission-retry",
            event => {

                const reportId =
                    event.detail
                        ?.reportId;


                if(reportId){

                    retryReport(
                        reportId
                    ).catch(
                        console.error
                    );


                    return;

                }


                retryPending({
                    includeUnconfirmed:true
                }).catch(
                    console.error
                );

            }
        );


        /* --------------------------------------------------------------
           BUTON STANDARD

           Compatibilitate cu pagini care folosesc:
           data-action="submit-final-report"
        -------------------------------------------------------------- */

        document.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        '[data-action="submit-final-report"]'
                    );


                if(!button){
                    return;
                }


                event.preventDefault();


                submit()
                    .catch(
                        error => {

                            console.error(
                                "[LaboratorGoogleSheets]",
                                error
                            );

                        }
                    );

            }
        );


        /* --------------------------------------------------------------
           REVENIRE INTERNET

           Retrimitem automat doar pending.

           NU retransmitem automat unconfirmed,
           deoarece este posibil să fie deja în Sheets.
        -------------------------------------------------------------- */

        globalThis.addEventListener(
            "online",
            () => {

                globalThis.setTimeout(
                    () => {

                        retryPending({
                            includeUnconfirmed:false
                        }).catch(
                            console.error
                        );

                    },
                    600
                );

            }
        );


        /* --------------------------------------------------------------
           MODIFICARE localStorage DIN ALTĂ FILĂ
        -------------------------------------------------------------- */

        globalThis.addEventListener(
            "storage",
            event => {

                if(
                    event.key !==
                    queueKey()
                ){

                    return;

                }


                dispatch(
                    "laborator:submission-queue-changed",
                    queueSummary(
                        readQueue()
                    )
                );

            }
        );

    }


    /* ==================================================================
       INIȚIALIZARE
    ================================================================== */

    async function init(
        options={}
    ){

        if(
            state.initialized
        ){

            return true;

        }


        /*
           Previne două inițializări simultane.
        */

        if(
            state.initializationPromise
        ){

            return state
                .initializationPromise;

        }


        state.initializationPromise =
            (
                async () => {

                    try{

                        state.generalConfig =
                            await loadGeneralConfig(

                                options.configUrl ||

                                DEFAULT_CONFIG_URL

                            );


                        state.submissionConfig = {

                            enabled:
                                true,

                            timeoutMilliseconds:
                                20000,

                            maximumRetries:
                                1,

                            retryDelayMilliseconds:
                                1500,

                            saveLocalBackup:
                                true,

                            localBackupKey:
                                DEFAULT_QUEUE_KEY,

                            messages:{

                                sending:
                                    "Datele se transmit către registrul clasei…",

                                success:
                                    "Rezultatele au fost înregistrate.",

                                failure:
                                    "Rezultatele nu au putut fi transmise."

                            },

                            ...(
                                state.generalConfig
                                    ?.submission ||
                                {}
                            ),

                            ...(
                                options.submission ||
                                {}
                            )

                        };


                        /*
                           Păstrăm mesajele implicite chiar dacă
                           configurarea definește doar unul dintre ele.
                        */

                        state.submissionConfig.messages = {

                            sending:
                                "Datele se transmit către registrul clasei…",

                            success:
                                "Rezultatele au fost înregistrate.",

                            failure:
                                "Rezultatele nu au putut fi transmise.",

                            ...(
                                state.generalConfig
                                    ?.submission
                                    ?.messages ||
                                {}
                            ),

                            ...(
                                options.submission
                                    ?.messages ||
                                {}
                            )

                        };


                        state.endpoint =
                            validateEndpoint(

                                options
                                    .googleScriptUrl ||

                                state.submissionConfig
                                    .googleScriptUrl

                            );


                        addEventListeners();


                        state.initialized =
                            true;


                        dispatch(
                            "laborator:google-sheets-ready",
                            {
                                pending:
                                    queueSummary(
                                        readQueue()
                                    )
                            }
                        );


                        /* ------------------------------------------------
                           RETRY AUTOMAT LA PORNIRE

                           Numai pending.
                           Nu unconfirmed.
                        ------------------------------------------------ */

                        if(
                            globalThis.navigator
                                ?.onLine &&
                            readQueue()
                                .some(
                                    item =>
                                        item.status ===
                                        "pending"
                                )
                        ){

                            globalThis.setTimeout(
                                () => {

                                    retryPending({
                                        includeUnconfirmed:false
                                    }).catch(
                                        console.error
                                    );

                                },
                                900
                            );

                        }


                        return true;

                    }
                    catch(error){

                        state.initialized =
                            false;


                        updateStatus(

                            error.message ||

                            "Conexiunea cu Google Sheets nu a putut fi configurată.",

                            "error"

                        );


                        console.error(
                            "[LaboratorGoogleSheets]",
                            error
                        );


                        return false;

                    }
                    finally{

                        state.initializationPromise =
                            null;

                    }

                }
            )();


        return state
            .initializationPromise;

    }


    /* ==================================================================
       API PUBLIC
    ================================================================== */

    globalThis
        .LaboratorGoogleSheets =
        Object.freeze({

            /*
               Inițializare.
            */

            init,


            /*
               Construirea raportului.
            */

            buildPayload,


            /*
               Salvare locală fără trimitere.
            */

            savePending,


            /*
               Trimiterea raportului.
            */

            submit,


            /*
               Retrimiterea unui raport după ID.
            */

            retryReport,


            /*
               Retrimiterea cozii.
            */

            retryPending,


            /*
               Lista completă a rapoartelor locale.
            */

            getPending:
                () =>
                    clone(
                        readQueue()
                    ),


            getPendingReports:
                () =>
                    clone(
                        readQueue()
                    ),


            /*
               Un singur raport.
            */

            getPendingReport:
                reportId =>
                    clone(
                        getPendingReport(
                            reportId
                        )
                    ),


            /*
               Numărul rapoartelor.
            */

            getQueueSummary:
                () =>
                    clone(
                        queueSummary(
                            readQueue()
                        )
                    ),


            /*
               Eliminare manuală.

               Nu recomand afișarea acestei funcții elevului.
            */

            removePending:
                reportId =>
                    removeFromQueue(
                        reportId
                    ),


            /*
               A fost confirmat pe acest dispozitiv?
            */

            hasBeenSent,


            /*
               Configurare disponibilă?
            */

            isConfigured:
                () =>
                    Boolean(
                        state.initialized &&
                        state.endpoint
                    ),


            /*
               Cheia localStorage.
            */

            getQueueKey:
                () =>
                    queueKey(),


            /*
               Versiunea modulului.
            */

            version:
                CLIENT_VERSION

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
            () => {

                init();

            },
            {
                once:true
            }
        );

    }
    else{

        init();

    }

})();
