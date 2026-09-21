/* ======================================================================
   FIZICA-LICEU
   TRIMITEREA REZULTATELOR CATRE GOOGLE SHEETS

   Versiune robusta pentru desktop, tableta si telefon.

   Functionalitati:
   - reportId unic pentru fiecare raport;
   - salvare LOCALA inainte de orice tentativa de trimitere;
   - aceleasi date sunt folosite la orice retrimitere;
   - coada comuna pentru toate experimentele;
   - retrimitere manuala;
   - retrimitere automata la revenirea conexiunii;
   - protectie impotriva trimiterilor simultane;
   - suport pentru confirmare explicita din Google Apps Script;
   - rapoartele neconfirmate NU sunt sterse din localStorage;
   - compatibilitate cu experimentele existente.

   Configurare:
   assets/data/configurare-generala.json
   -> submission.googleScriptUrl

   Incarcare:
   <script src="../assets/js/google-sheets.js" defer></script>

   API:
   window.LaboratorGoogleSheets

   Evenimente:
   - laborator:google-sheets-ready
   - laborator:submission-start
   - laborator:submission-sent
   - laborator:submission-unconfirmed
   - laborator:submission-failed
   - laborator:submission-queue-changed

   ====================================================================== */

(() => {

    "use strict";


    /* ================================================================
       CONSTANTE
    ================================================================ */

    const SCRIPT_URL =
        document.currentScript?.src ||
        document.baseURI;


    const DEFAULT_CONFIG_URL =
        new URL(
            "../data/configurare-generala.json",
            SCRIPT_URL
        ).href;


    /*
       IMPORTANT:
       aceasta este aceeasi cheie folosita de pagina principala
       pentru sectiunea:

       "Rapoarte netrimise de pe acest dispozitiv"
    */

    const DEFAULT_QUEUE_KEY =
        "fizica-laborator-rezultate-netrimise";


    /*
       Lista ID-urilor confirmate ca trimise.

       Este folosita numai ca protectie suplimentara pe dispozitiv.
       Protectia definitiva impotriva duplicatelor trebuie sa existe
       si in Google Apps Script.
    */

    const SENT_IDS_KEY =
        "fizica-laborator-rapoarte-trimise";


    const MAXIMUM_SENT_IDS = 200;


    /*
       Identificatorul mesajelor postMessage pe care le va trimite
       Google Apps Script dupa salvarea efectiva in tabel.
    */

    const CONFIRMATION_SOURCE =
        "fizica-laborator-google-sheets";


    const CLIENT_VERSION =
        "2.0.0";


    /* ================================================================
       STARE INTERNA
    ================================================================ */

    const state = {

        initialized:false,

        initPromise:null,

        generalConfig:null,

        submissionConfig:null,

        endpoint:"",

        listenersAdded:false,

        submittingReportIds:
            new Set(),

        latestEvaluation:null,

        latestEquipment:null,

        latestNotebook:null,

        latestSafety:null,

        latestMonitoring:null,

        latestReport:null

    };


    /* ================================================================
       FUNCTII GENERALE
    ================================================================ */

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


    /*
       Permite ca buildPayload({
           student:{ catalogNumber:17 }
       })

       sa adauge doar proprietatea respectiva,
       fara sa stearga name/className.
    */

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
                `${prefix}-` +
                globalThis.crypto
                    .randomUUID()
            );

        }


        const time =
            Date.now()
                .toString(36)
                .toUpperCase();


        const random =
            Math.random()
                .toString(36)
                .slice(2,10)
                .toUpperCase();


        return (
            `${prefix}-${time}-${random}`
        );

    }


    function wait(milliseconds){

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
        name,
        detail={}
    ){

        document.dispatchEvent(

            new CustomEvent(
                name,
                {
                    detail:
                        clone(detail)
                }
            )

        );

    }


    /* ================================================================
       LOCAL STORAGE
    ================================================================ */

    function safeStorageGet(
        key,
        fallback
    ){

        try{

            const value =
                globalThis
                    .localStorage
                    ?.getItem(key);


            if(!value){
                return fallback;
            }


            return JSON.parse(value);

        }
        catch(error){

            console.warn(
                "[LaboratorGoogleSheets] Datele locale nu au putut fi citite.",
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

            globalThis
                .localStorage
                ?.setItem(
                    key,
                    JSON.stringify(value)
                );


            return true;

        }
        catch(error){

            console.warn(
                "[LaboratorGoogleSheets] Datele locale nu au putut fi salvate.",
                error
            );


            return false;

        }

    }


    /* ================================================================
       CONFIGURARE
    ================================================================ */

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
                "Configurația generală nu a putut fi " +
                `încărcată (${response.status}).`
            );

        }


        const configuration =
            await response.json();


        globalThis
            .LAB_GENERAL_CONFIG =
            configuration;


        return configuration;

    }


    function validateEndpoint(value){

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


        const validHost =
            (
                url.protocol ===
                "https:"
            ) &&
            (
                url.hostname ===
                "script.google.com"
            );


        const validPath =
            /^\/macros\/s\/[^/]+\/exec\/?$/
                .test(
                    url.pathname
                );


        if(
            !validHost ||
            !validPath
        ){

            throw new Error(
                "Adresa Google Apps Script nu este validă. " +
                "Folosește adresa aplicației web care se termină în /exec."
            );

        }


        return url.href;

    }


    /* ================================================================
       COADA LOCALA
    ================================================================ */

    function queueKey(){

        return (
            state.submissionConfig
                ?.localBackupKey ||
            DEFAULT_QUEUE_KEY
        );

    }


    function normalizeQueueItem(item){

        if(
            !item ||
            !item.reportId ||
            !item.payload
        ){

            return null;

        }


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
                new Date()
                    .toISOString(),

            updatedAt:
                item.updatedAt ||
                item.queuedAt ||
                new Date()
                    .toISOString(),

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


    function readQueue(){

        const raw =
            safeStorageGet(
                queueKey(),
                []
            );


        if(!Array.isArray(raw)){
            return [];
        }


        return raw
            .map(
                normalizeQueueItem
            )
            .filter(Boolean);

    }


    function queueSummary(queue){

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


    function writeQueue(queue){

        const ok =
            safeStorageSet(
                queueKey(),
                queue
            );


        if(ok){

            dispatch(
                "laborator:submission-queue-changed",
                queueSummary(queue)
            );

        }


        return ok;

    }


    /*
       Raportul este introdus in coada INAINTE de trimitere.

       Daca raportul exista deja, payload-ul original este pastrat.
       Astfel retrimiterea foloseste EXACT aceleasi date.
    */

    function ensureQueued(
        payload,
        options={}
    ){

        const queue =
            readQueue();


        const existingIndex =
            queue.findIndex(
                item =>
                    item.reportId ===
                    payload.reportId
            );


        const now =
            new Date()
                .toISOString();


        if(existingIndex >= 0){

            const existing =
                queue[
                    existingIndex
                ];


            const updated = {

                ...existing,

                version:2,

                /*
                   NU inlocuim payload-ul original
                   decat daca cerem explicit acest lucru.
                */

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

                updatedAt:now

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


            queue[
                existingIndex
            ] = updated;


            writeQueue(queue);


            return clone(updated);

        }


        const item = {

            version:2,

            reportId:
                payload.reportId,

            payload:
                clone(payload),

            status:
                options.status ||
                "pending",

            queuedAt:now,

            updatedAt:now,

            attempts:0,

            lastAttemptAt:null,

            lastError:
                options.lastError ||
                "",

            lastTransport:
                options.lastTransport ||
                null

        };


        queue.push(item);

        writeQueue(queue);


        return clone(item);

    }


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


        writeQueue(queue);


        return clone(
            queue[index]
        );

    }


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


        queue[index] = {

            ...queue[index],

            attempts:
                Number(
                    queue[index]
                        .attempts ||
                    0
                ) + 1,

            lastAttemptAt:
                new Date()
                    .toISOString(),

            updatedAt:
                new Date()
                    .toISOString()

        };


        writeQueue(queue);

    }


    function removeFromQueue(
        reportId
    ){

        const queue =
            readQueue();


        const updatedQueue =
            queue.filter(
                item =>
                    item.reportId !==
                    reportId
            );


        if(
            updatedQueue.length ===
            queue.length
        ){
            return false;
        }


        writeQueue(
            updatedQueue
        );


        return true;

    }


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


    /* ================================================================
       RAPOARTE CONFIRMATE
    ================================================================ */

    function hasBeenSent(
        reportId
    ){

        const ids =
            safeStorageGet(
                SENT_IDS_KEY,
                []
            );


        return (
            Array.isArray(ids) &&
            ids.includes(
                reportId
            )
        );

    }


    function rememberSent(
        reportId
    ){

        const storedIds =
            safeStorageGet(
                SENT_IDS_KEY,
                []
            );


        const ids =
            Array.isArray(
                storedIds
            )
                ? storedIds
                : [];


        const updatedIds = [

            reportId,

            ...ids.filter(
                id =>
                    id !==
                    reportId
            )

        ].slice(
            0,
            MAXIMUM_SENT_IDS
        );


        safeStorageSet(
            SENT_IDS_KEY,
            updatedIds
        );

    }


    /* ================================================================
       CITIREA STARII LABORATORULUI
    ================================================================ */

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


    /* ================================================================
       CONSTRUIREA RAPORTULUI
    ================================================================ */

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

            createId("RAP");


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

            const converted =
                Number(
                    rawCatalogNumber
                );


            catalogNumber =
                Number.isFinite(converted)
                    ? converted
                    : normalize(
                        rawCatalogNumber
                    );

        }


        const basePayload = {

            schemaVersion:
                "1.1.0",

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
                    globalThis
                        .location
                        ?.href ||
                    "",

                userAgent:
                    globalThis
                        .navigator
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

                reportId

            }

        };


        const merged =
            deepMerge(
                basePayload,
                clone(overrides)
            );


        /*
           Garantam consistenta intre:
           payload.reportId
           si
           payload.report.reportId
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


    /* ================================================================
       VALIDARE RAPORT
    ================================================================ */

    function validatePayload(
        payload
    ){

        const errors = [];


        if(
            !normalize(
                payload.reportId
            )
        ){

            errors.push(
                "lipsește identificatorul raportului"
            );

        }


        if(
            !normalize(
                payload.student
                    ?.name
            )
        ){

            errors.push(
                "lipsește numele elevului"
            );

        }


        if(
            !normalize(
                payload.student
                    ?.className
            )
        ){

            errors.push(
                "lipsește clasa elevului"
            );

        }


        if(
            !normalize(
                payload.experiment
                    ?.title
            )
        ){

            errors.push(
                "lipsește titlul experimentului"
            );

        }


        if(
            !normalize(
                payload.session
                    ?.sessionId
            )
        ){

            errors.push(
                "lipsește codul sesiunii"
            );

        }


        if(
            !payload.evaluation ||
            payload.evaluation.score ===
                undefined
        ){

            errors.push(
                "evaluarea finală nu este completă"
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


    /* ================================================================
       STATUS IN INTERFATA
    ================================================================ */

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


                if(
                    type ===
                    "sending"
                ){

                    element.classList.add(
                        "is-sending"
                    );

                }


                if(
                    type ===
                    "error"
                ){

                    element.classList.add(
                        "is-error"
                    );

                }


                if(
                    type ===
                    "success"
                ){

                    element.classList.add(
                        "is-success"
                    );

                }


                if(
                    type ===
                    "pending"
                ){

                    element.classList.add(
                        "is-pending"
                    );

                }

            }

        }

    }


    /* ================================================================
       CONFIRMAREA DE LA GOOGLE APPS SCRIPT
    ================================================================ */

    function allowedConfirmationOrigin(
        origin
    ){

        try{

            const url =
                new URL(origin);


            return (

                url.protocol ===
                "https:" &&

                (
                    url.hostname ===
                        "script.google.com" ||

                    url.hostname.endsWith(
                        ".googleusercontent.com"
                    )
                )

            );

        }
        catch(error){

            return false;

        }

    }


    function parseConfirmationData(
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


    function isValidConfirmation(
        data,
        reportId
    ){

        if(!data){
            return false;
        }


        if(
            data.source !==
            CONFIRMATION_SOURCE
        ){

            return false;
        }


        if(
            String(
                data.reportId ||
                ""
            ) !==
            String(reportId)
        ){

            return false;
        }


        const acceptedTypes = [

            "submission-confirmed",

            "report-confirmed",

            "report-stored"

        ];


        const acceptedStatuses = [

            "stored",

            "sent",

            "duplicate",

            "ok",

            "confirmed"

        ];


        return (

            acceptedTypes.includes(
                data.type
            ) ||

            acceptedStatuses.includes(
                data.status
            )

        );

    }


    /* ================================================================
       TRANSPORTUL CATRE GOOGLE APPS SCRIPT

       IMPORTANT:
       incarcare iframe != confirmare salvare.

       Raportul este considerat CONFIRMAT numai daca Apps Script
       trimite un postMessage inapoi catre pagina.
    ================================================================ */

    function postPayload(
        payload
    ){

        return new Promise(
            (
                resolve,
                reject
            ) => {

                const frameName =
                    "google-sheets-response-" +
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .slice(2);


                const iframe =
                    document
                        .createElement(
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
                    document
                        .createElement(
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


                /*
                   Payload complet.
                */

                const payloadInput =
                    document
                        .createElement(
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


                /*
                   Trimitem separat reportId,
                   util pentru verificare rapida pe server.
                */

                const reportIdInput =
                    document
                        .createElement(
                            "input"
                        );


                reportIdInput.type =
                    "hidden";

                reportIdInput.name =
                    "reportId";

                reportIdInput.value =
                    payload.reportId;


                /*
                   Versiunea protocolului.
                */

                const protocolInput =
                    document
                        .createElement(
                            "input"
                        );


                protocolInput.type =
                    "hidden";

                protocolInput.name =
                    "clientProtocol";

                protocolInput.value =
                    "2";


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


                let completed =
                    false;


                let remoteLoaded =
                    false;


                let loadGraceTimer =
                    null;


                let overallTimer =
                    null;


                const timeoutMilliseconds =
                    Math.max(
                        3000,
                        Number(
                            state.submissionConfig
                                ?.timeoutMilliseconds ||
                            15000
                        )
                    );


                /*
                   Dupa ce iframe-ul incarca raspunsul,
                   asteptam putin confirmarea postMessage.
                */

                const confirmationGraceMilliseconds =
                    Math.max(
                        600,
                        Number(
                            state.submissionConfig
                                ?.confirmationGraceMilliseconds ||
                            1500
                        )
                    );


                function cleanup(){

                    globalThis
                        .removeEventListener(
                            "message",
                            onMessage
                        );


                    if(loadGraceTimer){

                        clearTimeout(
                            loadGraceTimer
                        );

                    }


                    if(overallTimer){

                        clearTimeout(
                            overallTimer
                        );

                    }


                    globalThis.setTimeout(
                        () => {

                            form.remove();

                            iframe.remove();

                        },
                        500
                    );

                }


                function finish(result){

                    if(completed){
                        return;
                    }


                    completed =
                        true;


                    cleanup();


                    resolve(result);

                }


                function fail(error){

                    if(completed){
                        return;
                    }


                    completed =
                        true;


                    cleanup();


                    reject(error);

                }


                function onMessage(event){

                    /*
                       Mesajul trebuie sa vina din iframe-ul
                       creat pentru aceasta trimitere.
                    */

                    if(
                        event.source !==
                        iframe.contentWindow
                    ){
                        return;
                    }


                    if(
                        !allowedConfirmationOrigin(
                            event.origin
                        )
                    ){
                        return;
                    }


                    const data =
                        parseConfirmationData(
                            event.data
                        );


                    if(
                        !isValidConfirmation(
                            data,
                            payload.reportId
                        )
                    ){
                        return;
                    }


                    finish({

                        ok:true,

                        confirmed:true,

                        status:
                            data.status ||
                            "confirmed",

                        duplicate:
                            data.status ===
                            "duplicate" ||
                            Boolean(
                                data.duplicate
                            ),

                        type:
                            "post-message-confirmation",

                        serverData:
                            clone(data)

                    });

                }


                globalThis
                    .addEventListener(
                        "message",
                        onMessage
                    );


                iframe.addEventListener(
                    "load",
                    () => {

                        /*
                           Ignoram incarcarea initiala:
                           about:blank
                        */

                        try{

                            const location =
                                iframe
                                    .contentWindow
                                    ?.location
                                    ?.href;


                            if(
                                location &&
                                location.startsWith(
                                    "about:blank"
                                )
                            ){

                                return;

                            }

                        }
                        catch(error){

                            /*
                               Accesul produce exceptie cand
                               iframe-ul a ajuns pe domeniul Google.

                               Acest lucru este normal.
                            */

                        }


                        remoteLoaded =
                            true;


                        /*
                           Incarcarea paginii Google arata doar
                           ca transportul a ajuns la endpoint.

                           NU inseamna inca faptul ca randul
                           este confirmat in Google Sheets.
                        */

                        if(loadGraceTimer){

                            clearTimeout(
                                loadGraceTimer
                            );

                        }


                        loadGraceTimer =
                            globalThis.setTimeout(
                                () => {

                                    finish({

                                        ok:true,

                                        confirmed:false,

                                        type:
                                            "form-submit-unconfirmed",

                                        iframeLoaded:true

                                    });

                                },
                                confirmationGraceMilliseconds
                            );

                    }
                );


                overallTimer =
                    globalThis.setTimeout(
                        () => {

                            finish({

                                ok:true,

                                confirmed:false,

                                type:
                                    "form-submit-timeout",

                                iframeLoaded:
                                    remoteLoaded

                            });

                        },
                        timeoutMilliseconds
                    );


                try{

                    form.submit();

                }
                catch(error){

                    fail(error);

                }

            }
        );

    }


    /* ================================================================
       TRIMITERE CU REINCERCARI

       Daca transportul a avut loc, dar nu avem confirmare,
       NU retrimitem automat imediat.

       Aceasta evita mai multe POST-uri consecutive inutile.
    ================================================================ */

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


        const delay =
            Math.max(
                0,
                Number(
                    state.submissionConfig
                        ?.retryDelayMilliseconds ||
                    1000
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
                   Daca POST-ul a fost executat,
                   chiar daca nu este confirmat,
                   ne oprim aici.

                   Elevul poate folosi ulterior
                   "Retrimite raportul".
                */

                return {

                    response,

                    attempt:
                        attempt + 1

                };

            }
            catch(error){

                lastError =
                    error;


                if(
                    attempt <
                    maximumRetries
                ){

                    await wait(
                        delay *
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
                "Cererea nu a putut fi trimisă."
            )

        );

    }


    /* ================================================================
       SALVARE LOCALA FARA TRIMITERE

       Poate fi apelata imediat ce raportul final este construit:
       await LaboratorGoogleSheets.savePending(payload);
    ================================================================ */

    async function savePending(
        payloadOrOverrides=null
    ){

        if(
            !state.initialized
        ){

            await init();

        }


        const looksLikePayload =
            Boolean(

                payloadOrOverrides
                    ?.schemaVersion &&

                payloadOrOverrides
                    ?.student

            );


        const payload =
            validatePayload(

                looksLikePayload

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
                    status:"pending",
                    lastError:""
                }
            );


        return clone(
            queued.payload
        );

    }


    /* ================================================================
       TRIMITERE RAPORT
    ================================================================ */

    async function submit(
        payloadOrOverrides=null,
        options={}
    ){

        if(
            !state.initialized
        ){

            await init();

        }


        if(
            !state.initialized ||
            !state.submissionConfig ||
            !state.endpoint
        ){

            throw new Error(
                "Conexiunea cu Google Sheets nu este configurată."
            );

        }


        if(
            !state.submissionConfig
                .enabled
        ){

            throw new Error(
                "Trimiterea către Google Sheets este dezactivată."
            );

        }


        const looksLikePayload =
            Boolean(

                payloadOrOverrides
                    ?.schemaVersion &&

                payloadOrOverrides
                    ?.student

            );


        let payload =
            validatePayload(

                looksLikePayload

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


        /*
           Protectie impotriva dublului click.
        */

        if(
            state.submittingReportIds
                .has(reportId)
        ){

            throw new Error(
                "Acest raport este deja în curs de trimitere."
            );

        }


        const multipleSubmissionsAllowed =
            Boolean(
                state.submissionConfig
                    .allowMultipleSubmissions
            );


        /*
           Raport confirmat anterior pe acest dispozitiv.
        */

        if(
            !options.force &&
            !multipleSubmissionsAllowed &&
            hasBeenSent(reportId)
        ){

            updateStatus(
                "Acest raport a fost deja trimis și confirmat.",
                "success"
            );


            return {

                status:"duplicate",

                reportId,

                confirmed:true

            };

        }


        /*
           PAS ESENTIAL:

           salvam raportul LOCAL inainte sa facem POST.

           Daca browserul se inchide sau conexiunea cade
           dupa acest moment, datele raman pe dispozitiv.
        */

        if(
            state.submissionConfig
                .saveLocalBackup !==
            false
        ){

            const queueItem =
                ensureQueued(
                    payload,
                    {
                        status:"pending"
                    }
                );


            /*
               Daca raportul exista deja in coada,
               folosim EXACT payload-ul original.
            */

            payload =
                clone(
                    queueItem.payload
                );

        }


        state.submittingReportIds
            .add(reportId);


        updateStatus(

            state.submissionConfig
                .messages
                ?.sending ||

            "Rezultatul se transmite către registrul clasei…",

            "sending"

        );


        dispatch(
            "laborator:submission-start",
            {
                reportId
            }
        );


        try{

            if(
                globalThis.navigator &&
                !globalThis.navigator
                    .onLine
            ){

                throw new Error(
                    "Conexiunea la internet este indisponibilă."
                );

            }


            const result =
                await sendWithRetries(
                    payload
                );


            const response =
                result.response;


            /* --------------------------------------------------------
               CONFIRMARE EXPLICITA DE LA SERVER
            -------------------------------------------------------- */

            if(
                response.confirmed
            ){

                rememberSent(
                    reportId
                );


                removeFromQueue(
                    reportId
                );


                const duplicate =
                    Boolean(
                        response.duplicate
                    );


                const message =
                    duplicate

                        ? (
                            "Raportul exista deja în registru. " +
                            "Nu a fost creat un rând duplicat."
                        )

                        : (
                            state.submissionConfig
                                .messages
                                ?.success ||

                            "Rezultatul a fost înregistrat."
                        );


                updateStatus(
                    message,
                    "success"
                );


                dispatch(
                    "laborator:submission-sent",
                    {

                        reportId,

                        confirmed:true,

                        duplicate,

                        status:
                            duplicate
                                ? "duplicate"
                                : "sent",

                        attempts:
                            result.attempt,

                        transport:
                            response.type

                    }
                );


                return {

                    status:
                        duplicate
                            ? "duplicate"
                            : "sent",

                    reportId,

                    confirmed:true,

                    duplicate,

                    attempts:
                        result.attempt

                };

            }


            /* --------------------------------------------------------
               POST EXECUTAT, DAR SERVERUL NU A CONFIRMAT
            -------------------------------------------------------- */

            updateQueueItem(
                reportId,
                {

                    status:
                        "unconfirmed",

                    lastError:
                        "",

                    lastTransport:
                        response.type

                }
            );


            const message =
                "Cererea a fost transmisă către Google Apps Script, " +
                "dar salvarea nu a fost confirmată de server. " +
                "Raportul rămâne salvat pe acest dispozitiv și poate fi retransmis.";


            updateStatus(
                message,
                "pending"
            );


            /*
               Evenimentul submission-sent ramane pentru
               compatibilitate cu modulele existente.

               confirmed:false arata clar ca nu avem
               confirmarea salvarii.
            */

            dispatch(
                "laborator:submission-sent",
                {

                    reportId,

                    confirmed:false,

                    status:
                        "unconfirmed",

                    attempts:
                        result.attempt,

                    transport:
                        response.type

                }
            );


            dispatch(
                "laborator:submission-unconfirmed",
                {

                    reportId,

                    attempts:
                        result.attempt,

                    transport:
                        response.type

                }
            );


            return {

                status:
                    "unconfirmed",

                reportId,

                confirmed:false,

                attempts:
                    result.attempt

            };

        }
        catch(error){

            /*
               Raportul ramane / este pus in coada.
            */

            if(
                state.submissionConfig
                    .saveLocalBackup !==
                false
            ){

                ensureQueued(
                    payload,
                    {
                        status:"pending",
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

                "Rezultatul nu a putut fi transmis.";


            const message =

                `${failureMessage} ` +

                "Datele au fost păstrate local și pot fi retransmise ulterior.";


            updateStatus(
                message,
                "error"
            );


            dispatch(
                "laborator:submission-failed",
                {

                    reportId,

                    message:
                        error.message ||
                        "Eroare necunoscută"

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


    /* ================================================================
       RETRIMITEREA UNUI RAPORT ANUME
    ================================================================ */

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

                    status:"duplicate",

                    reportId,

                    confirmed:true

                };

            }


            throw new Error(
                "Raportul solicitat nu mai există în memoria locală."
            );

        }


        return submit(
            item.payload,
            {
                force:true
            }
        );

    }


    /* ================================================================
       RETRIMITEREA COZII

       Automat:
       - retrimitem numai "pending"

       Manual:
       retryPending({ includeUnconfirmed:true })
       poate retransmite si rapoartele neconfirmate.
    ================================================================ */

    async function retryPending(
        options={}
    ){

        if(
            !state.initialized
        ){

            await init();

        }


        if(
            !state.initialized
        ){
            return [];
        }


        if(
            globalThis.navigator &&
            !globalThis.navigator
                .onLine
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

            /*
               Daca raportul este deja procesat de alta actiune,
               trecem la urmatorul.
            */

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

                    status:"failed",

                    reportId:
                        item.reportId,

                    message:
                        error.message

                });


                /*
                   La retry automat ne oprim dupa
                   prima problema de retea.
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


    /* ================================================================
       MEMORAREA EVENIMENTELOR DIN LABORATOR
    ================================================================ */

    function rememberEventData(
        event,
        key
    ){

        state[key] =
            clone(
                event.detail ||
                {}
            );

    }


    function addEventListeners(){

        if(
            state.listenersAdded
        ){
            return;
        }


        state.listenersAdded =
            true;


        /* ----------------------------------------------------------
           EVALUARE
        ---------------------------------------------------------- */

        document.addEventListener(
            "laborator:evaluation-complete",
            event => {

                rememberEventData(
                    event,
                    "latestEvaluation"
                );

            }
        );


        /* ----------------------------------------------------------
           ECHIPAMENTE
        ---------------------------------------------------------- */

        document.addEventListener(
            "laborator:equipment-complete",
            event => {

                rememberEventData(
                    event,
                    "latestEquipment"
                );

            }
        );


        /* ----------------------------------------------------------
           CAIET / DATE EXPERIMENTALE
        ---------------------------------------------------------- */

        document.addEventListener(
            "laborator:notebook-complete",
            event => {

                rememberEventData(
                    event,
                    "latestNotebook"
                );

            }
        );


        /* ----------------------------------------------------------
           SECURITATE
        ---------------------------------------------------------- */

        document.addEventListener(
            "laborator:safety-complete",
            event => {

                rememberEventData(
                    event,
                    "latestSafety"
                );

            }
        );


        /* ----------------------------------------------------------
           MONITORIZARE
        ---------------------------------------------------------- */

        document.addEventListener(
            "laborator:monitoring-update",
            event => {

                rememberEventData(
                    event,
                    "latestMonitoring"
                );

            }
        );


        /* ----------------------------------------------------------
           RAPORT FINAL

           Daca raportul contine deja reportId, il salvam
           imediat local.

           Astfel elevul poate inchide pagina chiar inainte
           de apasarea butonului "Trimite".
        ---------------------------------------------------------- */

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


                /*
                   Salvarea este best-effort.
                   Daca raportul nu este inca complet,
                   nu blocam experimentul.
                */

                try{

                    const payload =
                        validatePayload(
                            buildPayload({
                                reportId
                            })
                        );


                    ensureQueued(
                        payload,
                        {
                            status:"pending"
                        }
                    );

                }
                catch(error){

                    console.warn(
                        "[LaboratorGoogleSheets] Raportul final nu a putut fi încă salvat automat.",
                        error
                    );

                }

            }
        );


        /* ----------------------------------------------------------
           RETRY SOLICITAT PRIN EVENIMENT
        ---------------------------------------------------------- */

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


        /* ----------------------------------------------------------
           BUTON STANDARD EXISTENT
        ---------------------------------------------------------- */

        document.addEventListener(
            "click",
            event => {

                const button =
                    event.target
                        .closest(
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


        /* ----------------------------------------------------------
           REVENIREA INTERNETULUI

           Retrimitem automat doar rapoartele care au esuat clar.

           Rapoartele "unconfirmed" raman pentru retrimitere manuala,
           deoarece este posibil sa fi ajuns deja la server.
        ---------------------------------------------------------- */

        globalThis.addEventListener(
            "online",
            () => {

                retryPending({
                    includeUnconfirmed:false
                }).catch(
                    console.error
                );

            }
        );


        /* ----------------------------------------------------------
           MODIFICARE LOCALSTORAGE DIN ALTA FILA
        ---------------------------------------------------------- */

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


    /* ================================================================
       INITIALIZARE
    ================================================================ */

    async function init(
        options={}
    ){

        if(
            state.initialized
        ){

            return true;

        }


        /*
           Previne doua initializari simultane.
        */

        if(
            state.initPromise
        ){

            return state.initPromise;

        }


        state.initPromise =
            (
                async () => {

                    try{

                        state.generalConfig =
                            await loadGeneralConfig(

                                options.configUrl ||

                                DEFAULT_CONFIG_URL

                            );


                        state.submissionConfig = {

                            enabled:true,

                            method:"POST",

                            mode:"no-cors",

                            contentType:
                                "text/plain;charset=UTF-8",

                            timeoutMilliseconds:
                                15000,

                            confirmationGraceMilliseconds:
                                1500,

                            maximumRetries:
                                2,

                            retryDelayMilliseconds:
                                1500,

                            saveLocalBackup:
                                true,

                            allowMultipleSubmissions:
                                false,

                            ...(
                                state.generalConfig
                                    .submission ||
                                {}
                            ),

                            ...(
                                options.submission ||
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


                        /*
                           La deschiderea paginii retransmitem automat
                           numai rapoartele care au esuat clar.

                           Nu retransmitem automat "unconfirmed".
                        */

                        if(
                            globalThis.navigator
                                ?.onLine &&
                            readQueue().some(
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
                                500
                            );

                        }


                        return true;

                    }
                    catch(error){

                        updateStatus(

                            error.message ||

                            "Conexiunea cu Google Sheets nu a putut fi configurată.",

                            "error"

                        );


                        console.error(
                            "[LaboratorGoogleSheets]",
                            error
                        );


                        state.initialized =
                            false;


                        return false;

                    }
                    finally{

                        state.initPromise =
                            null;

                    }

                }
            )();


        return state.initPromise;

    }


    /* ================================================================
       API PUBLIC
    ================================================================ */

    globalThis
        .LaboratorGoogleSheets =
        Object.freeze({

            /*
               Initializare manuala, daca este necesara.
            */

            init,


            /*
               Construieste raportul.
            */

            buildPayload,


            /*
               Salveaza raportul local fara sa il trimita.
            */

            savePending,


            /*
               Trimite raportul.
            */

            submit,


            /*
               Retrimite un singur raport dupa reportId.
            */

            retryReport,


            /*
               Retrimite coada.
            */

            retryPending,


            /*
               Returneaza toate rapoartele pastrate local.
            */

            getPending:
                () =>
                    clone(
                        readQueue()
                    ),


            /*
               Alias mai explicit.
            */

            getPendingReports:
                () =>
                    clone(
                        readQueue()
                    ),


            /*
               Returneaza un raport anume.
            */

            getPendingReport:
                reportId =>
                    clone(
                        getPendingReport(
                            reportId
                        )
                    ),


            /*
               Statistica pentru pagina principala.
            */

            getQueueSummary:
                () =>
                    clone(
                        queueSummary(
                            readQueue()
                        )
                    ),


            /*
               Eliminare manuala.
               Nu o vom afisa elevilor in mod normal.
            */

            removePending:
                reportId =>
                    removeFromQueue(
                        reportId
                    ),


            /*
               Verifica daca un ID a fost confirmat anterior
               pe dispozitiv.
            */

            hasBeenSent,


            /*
               Starea modulului.
            */

            isConfigured:
                () =>
                    Boolean(
                        state.initialized &&
                        state.endpoint
                    ),


            /*
               Cheia folosita de pagina principala.
            */

            getQueueKey:
                () =>
                    queueKey(),


            /*
               Versiune.
            */

            version:
                CLIENT_VERSION

        });


    /* ================================================================
       PORNIRE AUTOMATA
    ================================================================ */

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
