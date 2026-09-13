/**
 * Laborator virtual de fizică - backend Google Apps Script
 *
 * Primește rapoartele trimise de:
 *   laborator-fizica/assets/js/google-sheets.js
 *
 * CONFIGURARE RAPIDĂ
 * 1. Deschide foaia Google Sheets în care dorești rezultatele.
 * 2. Accesează Extensii -> Apps Script.
 * 3. Înlocuiește conținutul fișierului Code.gs cu acest cod.
 * 4. Rulează o singură dată funcția setup() și acordă permisiunile cerute.
 * 5. Alege Implementare -> Implementare nouă -> Aplicație web.
 * 6. Execută ca: Eu. Acces: Oricine.
 * 7. Copiază adresa terminată în /exec în:
 *    assets/data/configurare-generala.json -> submission.googleScriptUrl
 *
 * Dacă proiectul Apps Script nu este legat de o foaie de calcul, setează
 * SPREADSHEET_ID mai jos sau adaugă proprietatea de script SPREADSHEET_ID.
 */

const APP_CONFIG = Object.freeze({
  SPREADSHEET_ID: '',
  RESULTS_SHEET: 'Rezultate laborator',
  RAW_DATA_SHEET: 'Date complete',
  TIME_ZONE: 'Europe/Bucharest',
  MAX_TEXT_LENGTH: 5000,
  MAX_JSON_LENGTH: 45000,
  LOCK_TIMEOUT_MS: 20000,
  ALLOW_DUPLICATE_REPORT_IDS: false
});

const RESULT_HEADERS = Object.freeze([
  'Înregistrat la',
  'ID raport',
  'Nume și prenume',
  'Clasa',
  'Titlul experimentului',
  'ID experiment',
  'Domeniul',
  'Nivelul clasei',
  'Set de date',
  'Data experimentului',
  'Început sesiune',
  'Sfârșit sesiune',
  'Durată (s)',
  'Punctaj',
  'Punctaj maxim',
  'Procentaj',
  'Promovat',
  'Răspunsuri corecte',
  'Total întrebări',
  'Concluzia elevului',
  'Surse de eroare',
  'Securitate acceptată',
  'Data acceptării securității',
  'Echipamente selectate',
  'Măsurări',
  'Calcule',
  'Compararea rezultatelor',
  'Schimbări filă/pagină',
  'Pierderi focalizare fereastră',
  'Ieșiri din ecran complet',
  'Încercări copiere',
  'Încercări decupare',
  'Încercări lipire',
  'Meniu contextual',
  'Scurtături blocate',
  'Evenimente monitorizare',
  'Confirmare identitate',
  'Confirmare lucru individual',
  'URL pagină',
  'Versiune schemă'
]);

const RAW_HEADERS = Object.freeze([
  'Înregistrat la',
  'ID raport',
  'Nume și prenume',
  'Clasa',
  'Titlul experimentului',
  'Conținut JSON'
]);

/**
 * Inițializează foile și anteturile.
 * Se rulează manual o singură dată.
 */
function setup() {
  const spreadsheet = getSpreadsheet_();
  const resultsSheet = getOrCreateSheet_(
    spreadsheet,
    APP_CONFIG.RESULTS_SHEET
  );
  const rawSheet = getOrCreateSheet_(
    spreadsheet,
    APP_CONFIG.RAW_DATA_SHEET
  );

  configureSheet_(resultsSheet, RESULT_HEADERS);
  configureSheet_(rawSheet, RAW_HEADERS);

  PropertiesService.getScriptProperties().setProperty(
    'SETUP_COMPLETED_AT',
    new Date().toISOString()
  );

  return 'Configurare finalizată. Acum publică proiectul ca aplicație web.';
}

/**
 * Răspuns de verificare când adresa /exec
 * este deschisă în browser.
 */
function doGet() {
  return jsonResponse_({
    ok: true,
    application: 'Laborator virtual de fizică',
    message: 'Serviciul Google Apps Script este activ.',
    serverTime: new Date().toISOString()
  });
}

/**
 * Primește raportul transmis prin POST
 * de pagina laboratorului.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(APP_CONFIG.LOCK_TIMEOUT_MS);

    const payload = parseRequest_(e);
    validatePayload_(payload);

    const spreadsheet = getSpreadsheet_();
    const resultsSheet = getOrCreateSheet_(
      spreadsheet,
      APP_CONFIG.RESULTS_SHEET
    );
    const rawSheet = getOrCreateSheet_(
      spreadsheet,
      APP_CONFIG.RAW_DATA_SHEET
    );

    ensureHeaders_(resultsSheet, RESULT_HEADERS);
    ensureHeaders_(rawSheet, RAW_HEADERS);

    if (
      !APP_CONFIG.ALLOW_DUPLICATE_REPORT_IDS &&
      reportExists_(resultsSheet, payload.reportId)
    ) {
      return jsonResponse_({
        ok: true,
        duplicate: true,
        reportId: payload.reportId,
        message: 'Raportul fusese deja înregistrat.'
      });
    }

    const receivedAt = new Date();

    appendSafeRow_(
      resultsSheet,
      buildResultRow_(payload, receivedAt)
    );

    appendSafeRow_(
      rawSheet,
      buildRawRow_(payload, receivedAt)
    );

    return jsonResponse_({
      ok: true,
      duplicate: false,
      reportId: payload.reportId,
      message: 'Rezultatul a fost înregistrat.',
      serverTime: receivedAt.toISOString()
    });
  } catch (error) {
    console.error(
      error && error.stack
        ? error.stack
        : error
    );

    return jsonResponse_({
      ok: false,
      error: error && error.message
        ? error.message
        : String(error)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (ignored) {
      // Blocarea nu fusese obținută
      // sau fusese deja eliberată.
    }
  }
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Cererea nu conține date.');
  }

  let payload;

  try {
    payload = JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error(
      'Conținutul primit nu este JSON valid.'
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error(
      'Raportul primit are un format invalid.'
    );
  }

  return payload;
}

function validatePayload_(payload) {
  const errors = [];

  const reportId = text_(
    payload.reportId,
    150
  );

  const studentName = text_(
    get_(payload, 'student.name'),
    100
  );

  const studentClass = text_(
    get_(payload, 'student.className'),
    30
  );

  const experimentTitle = text_(
    get_(payload, 'experiment.title'),
    250
  );

  const sessionId = text_(
    get_(payload, 'session.sessionId'),
    150
  );

  if (!reportId) {
    errors.push('lipsește ID-ul raportului');
  }

  if (studentName.length < 3) {
    errors.push('numele elevului este invalid');
  }

  if (studentClass.length < 2) {
    errors.push('clasa elevului este invalidă');
  }

  if (!experimentTitle) {
    errors.push('lipsește titlul experimentului');
  }

  if (!sessionId) {
    errors.push('lipsește ID-ul sesiunii');
  }

  if (
    !payload.evaluation ||
    get_(payload, 'evaluation.score') === undefined
  ) {
    errors.push('lipsește evaluarea finală');
  }

  if (errors.length) {
    throw new Error(
      'Raport respins: ' +
      errors.join('; ') +
      '.'
    );
  }
}

function buildResultRow_(payload, receivedAt) {
  const monitoring = payload.monitoring || {};
  const counters = monitoring.counters || monitoring;
  const evaluation = payload.evaluation || {};
  const safety = payload.safety || {};
  const equipment = payload.equipment || {};

  return [
    receivedAt,
    text_(payload.reportId, 150),
    text_(get_(payload, 'student.name'), 100),
    text_(get_(payload, 'student.className'), 30),
    text_(get_(payload, 'experiment.title'), 250),
    text_(get_(payload, 'experiment.id'), 150),
    text_(get_(payload, 'experiment.domain'), 100),
    text_(get_(payload, 'experiment.classLevel'), 50),
    scalar_(get_(payload, 'experiment.dataSetId')),
    text_(get_(payload, 'session.dateDisplay'), 100),
    dateOrText_(get_(payload, 'session.startedAt')),
    dateOrText_(get_(payload, 'session.finishedAt')),
    numberOrBlank_(
      get_(payload, 'session.durationSeconds')
    ),
    numberOrBlank_(evaluation.score),
    numberOrBlank_(evaluation.maximumScore),
    numberOrBlank_(evaluation.percent),
    yesNo_(evaluation.passed),
    numberOrBlank_(evaluation.correctAnswers),
    numberOrBlank_(evaluation.totalQuestions),
    text_(
      evaluation.conclusion,
      APP_CONFIG.MAX_TEXT_LENGTH
    ),
    listText_(evaluation.errorSources),
    yesNo_(safety.accepted),
    dateOrText_(safety.acceptedAt),
    equipmentText_(equipment),
    jsonText_(
      payload.measurements,
      APP_CONFIG.MAX_JSON_LENGTH
    ),
    jsonText_(
      payload.calculations,
      APP_CONFIG.MAX_JSON_LENGTH
    ),
    jsonText_(
      payload.comparison,
      APP_CONFIG.MAX_JSON_LENGTH
    ),
    numberOrBlank_(counters.tabSwitches),
    numberOrBlank_(counters.windowBlurs),
    numberOrBlank_(counters.fullscreenExits),
    numberOrBlank_(counters.copyAttempts),
    numberOrBlank_(counters.cutAttempts),
    numberOrBlank_(counters.pasteAttempts),
    numberOrBlank_(counters.contextMenuAttempts),
    numberOrBlank_(counters.blockedShortcuts),
    jsonText_(
      monitoring.events || [],
      APP_CONFIG.MAX_JSON_LENGTH
    ),
    yesNo_(
      get_(payload, 'student.identityConfirmed')
    ),
    yesNo_(evaluation.individualWorkConfirmed),
    text_(
      get_(payload, 'application.pageUrl'),
      1000
    ),
    text_(payload.schemaVersion, 50)
  ];
}

function buildRawRow_(payload, receivedAt) {
  return [
    receivedAt,
    text_(payload.reportId, 150),
    text_(get_(payload, 'student.name'), 100),
    text_(get_(payload, 'student.className'), 30),
    text_(get_(payload, 'experiment.title'), 250),
    jsonText_(
      payload,
      APP_CONFIG.MAX_JSON_LENGTH
    )
  ];
}

function getSpreadsheet_() {
  const scriptId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  const spreadsheetId = text_(
    scriptId || APP_CONFIG.SPREADSHEET_ID,
    250
  );

  if (spreadsheetId) {
    return SpreadsheetApp.openById(
      spreadsheetId
    );
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();

  if (!active) {
    throw new Error(
      'Proiectul nu este legat de Google Sheets. ' +
      'Completează APP_CONFIG.SPREADSHEET_ID.'
    );
  }

  return active;
}

function getOrCreateSheet_(spreadsheet, name) {
  return (
    spreadsheet.getSheetByName(name) ||
    spreadsheet.insertSheet(name)
  );
}

function configureSheet_(sheet, headers) {
  ensureHeaders_(sheet, headers);

  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, headers.length)
    .setBackground('#173f5f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true);

  sheet.autoResizeColumns(
    1,
    headers.length
  );

  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(5, 280);
}

function ensureHeaders_(sheet, headers) {
  const current = sheet
    .getRange(1, 1, 1, headers.length)
    .getDisplayValues()[0];

  const differs = headers.some(
    function (header, index) {
      return current[index] !== header;
    }
  );

  if (differs) {
    sheet
      .getRange(1, 1, 1, headers.length)
      .setValues([headers]);
  }
}

function reportExists_(sheet, reportId) {
  if (sheet.getLastRow() < 2) {
    return false;
  }

  const finder = sheet
    .getRange(
      2,
      2,
      sheet.getLastRow() - 1,
      1
    )
    .createTextFinder(
      text_(reportId, 150)
    )
    .matchEntireCell(true)
    .matchCase(true);

  return Boolean(finder.findNext());
}

function appendSafeRow_(sheet, values) {
  const row = values.map(safeCell_);

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      1,
      row.length
    )
    .setValues([row]);
}

/**
 * Previne interpretarea textelor elevului
 * drept formule în Google Sheets.
 */
function safeCell_(value) {
  if (
    value instanceof Date ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  const stringValue = String(
    value === null || value === undefined
      ? ''
      : value
  );

  return /^[=+\-@]/.test(stringValue)
    ? "'" + stringValue
    : stringValue;
}

function get_(object, path) {
  return String(path)
    .split('.')
    .reduce(function (value, key) {
      return value !== null &&
        value !== undefined
        ? value[key]
        : undefined;
    }, object);
}

function text_(value, maximumLength) {
  const limit =
    maximumLength ||
    APP_CONFIG.MAX_TEXT_LENGTH;

  return String(
    value === null || value === undefined
      ? ''
      : value
  )
    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
      ''
    )
    .trim()
    .slice(0, limit);
}

function scalar_(value) {
  if (typeof value === 'number') {
    return numberOrBlank_(value);
  }

  if (typeof value === 'boolean') {
    return yesNo_(value);
  }

  return text_(value, 250);
}

function numberOrBlank_(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return '';
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : '';
}

function yesNo_(value) {
  if (value === true) {
    return 'Da';
  }

  if (value === false) {
    return 'Nu';
  }

  return '';
}

function dateOrText_(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? text_(value, 100)
    : date;
}

function listText_(value) {
  if (!Array.isArray(value)) {
    return text_(
      value,
      APP_CONFIG.MAX_TEXT_LENGTH
    );
  }

  return text_(
    value.map(function (item) {
      return typeof item === 'object'
        ? jsonText_(item, 1000)
        : item;
    }).join('; '),
    APP_CONFIG.MAX_TEXT_LENGTH
  );
}

function equipmentText_(equipment) {
  if (
    Array.isArray(equipment.items) &&
    equipment.items.length
  ) {
    return text_(
      equipment.items
        .map(function (item) {
          return item && (item.name || item.id)
            ? item.name || item.id
            : '';
        })
        .filter(Boolean)
        .join('; '),
      APP_CONFIG.MAX_TEXT_LENGTH
    );
  }

  if (Array.isArray(equipment.selectedIds)) {
    return listText_(equipment.selectedIds);
  }

  return jsonText_(
    equipment,
    APP_CONFIG.MAX_TEXT_LENGTH
  );
}

function jsonText_(value, maximumLength) {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  let result;

  try {
    result = JSON.stringify(value);
  } catch (error) {
    result = String(value);
  }

  return text_(
    result,
    maximumLength ||
    APP_CONFIG.MAX_JSON_LENGTH
  );
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
