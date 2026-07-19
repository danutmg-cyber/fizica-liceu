/**
 * app.js — fizica-liceu
 * ---------------------------------------------------------------
 * Citește assets/data/clase.json și construiește automat:
 *   1. Navigarea (meniu clase → capitole → lecții)          → #app-nav
 *   2. Fir de Ariadna / breadcrumb                            → #breadcrumb
 *   3. Bare de progres pe capitol/clasă                       → [data-progress]
 *   4. Marcaj "În curând" pentru lecțiile/capitolele stub
 *
 * Nu face nimic dacă elementele țintă nu există în pagină, deci
 * poate fi inclus pe orice pagină a site-ului fără efecte adverse.
 *
 * Utilizare (în orice index.html, indiferent de adâncime):
 *   <script src="../../assets/js/app.js" defer></script>
 *
 * Scriptul detectează singur calea către clase.json, indiferent
 * de câte foldere în adâncime se află pagina curentă.
 * ---------------------------------------------------------------
 */

(function () {
  "use strict";

  const DATA_FILENAME = "assets/data/clase.json";

  // Câte niveluri "../" încercăm, în ordine, până găsim clase.json.
  // Acoperă orice adâncime rezonabilă a site-ului (index.html până la
  // clasaN/lectii/capitol/lectia-X.html, care e 3 niveluri sub rădăcină).
  const CANDIDATE_PREFIXES = ["", "../", "../../", "../../../", "../../../../"];

  const FizicaLiceu = {
    data: null,
    ready: null, // Promise rezolvat când datele sunt încărcate
  };

  window.FizicaLiceu = FizicaLiceu;

  // ---------------------------------------------------------------
  // 1. Încărcarea datelor
  // ---------------------------------------------------------------

  async function loadData() {
    for (const prefix of CANDIDATE_PREFIXES) {
      try {
        const res = await fetch(prefix + DATA_FILENAME, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          FizicaLiceu.data = json;
          FizicaLiceu.basePath = prefix; // rădăcina site-ului, relativ la pagina curentă
          return json;
        }
      } catch (e) {
        // încearcă următorul prefix
      }
    }
    console.warn(
      "[FizicaLiceu] Nu am putut încărca " +
        DATA_FILENAME +
        ". Dacă deschizi pagina direct din sistemul de fișiere (file://), " +
        "browserul blochează fetch() pentru fișiere locale — rulează site-ul " +
        "printr-un server local (ex. `python3 -m http.server`) sau prin GitHub Pages."
    );
    return null;
  }

  // ---------------------------------------------------------------
  // 2. Funcții ajutătoare pentru interogarea datelor
  // ---------------------------------------------------------------

  function getClasa(clasaId) {
    if (!FizicaLiceu.data) return null;
    return FizicaLiceu.data.clase.find((c) => c.id === clasaId) || null;
  }

  function getCapitol(clasaId, capitolId) {
    const clasa = getClasa(clasaId);
    if (!clasa) return null;
    return clasa.capitole.find((c) => c.id === capitolId) || null;
  }

  function progresClasa(clasa) {
    let total = 0;
    let complete = 0;
    for (const cap of clasa.capitole) {
      total += cap.numarLectii;
      complete += cap.lectiiComplete;
    }
    return { total, complete };
  }

  FizicaLiceu.getClasa = getClasa;
  FizicaLiceu.getCapitol = getCapitol;
  FizicaLiceu.progresClasa = progresClasa;

  // ---------------------------------------------------------------
  // 3. Navigare — construită în #app-nav (dacă există pe pagină)
  // ---------------------------------------------------------------

  function link(href, text, opts = {}) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if (opts.stub) {
      a.classList.add("fl-link--stub");
      a.setAttribute("aria-disabled", "true");
      a.title = "Conținut în curs de redactare";
    }
    if (opts.current) {
      a.setAttribute("aria-current", "page");
      a.classList.add("fl-link--activ");
    }
    return a;
  }

  function badge(text) {
    const span = document.createElement("span");
    span.className = "fl-badge-stub";
    span.textContent = text;
    return span;
  }

  function buildNav() {
    const container = document.getElementById("app-nav");
    if (!container || !FizicaLiceu.data) return;

    const base = FizicaLiceu.basePath;
    const currentPath = normalizedCurrentPath();

    const root = document.createElement("nav");
    root.className = "fl-nav";
    root.setAttribute("aria-label", "Navigare clase și capitole");

    for (const clasa of FizicaLiceu.data.clase) {
      const details = document.createElement("details");
      details.className = "fl-nav__clasa";
      // deschide automat clasa care conține pagina curentă
      if (currentPath.startsWith(clasa.id + "/")) details.open = true;

      const summary = document.createElement("summary");
      const { total, complete } = progresClasa(clasa);
      summary.appendChild(
        link(base + clasa.path, clasa.nume, {
          current: currentPath === clasa.path,
        })
      );
      if (total > 0) {
        const prog = document.createElement("small");
        prog.className = "fl-nav__progres";
        prog.textContent = ` (${complete}/${total} lecții)`;
        summary.appendChild(prog);
      }
      details.appendChild(summary);

      const ulCapitole = document.createElement("ul");
      ulCapitole.className = "fl-nav__capitole";

      for (const cap of clasa.capitole) {
        const liCap = document.createElement("li");
        const capStub = cap.status === "stub" && cap.lectiiComplete === 0;

        liCap.appendChild(
          link(base + cap.path, cap.nume, {
            stub: capStub,
            current: currentPath === cap.path,
          })
        );
        if (capStub) {
          liCap.appendChild(badge("în curând"));
        } else if (cap.numarLectii > 0) {
          const prog = document.createElement("small");
          prog.className = "fl-nav__progres";
          prog.textContent = ` ${cap.lectiiComplete}/${cap.numarLectii}`;
          liCap.appendChild(prog);
        }

        ulCapitole.appendChild(liCap);
      }

      details.appendChild(ulCapitole);
      root.appendChild(details);
    }

    container.innerHTML = "";
    container.appendChild(root);
  }

  // ---------------------------------------------------------------
  // 4. Breadcrumb — construit în #breadcrumb (dacă există pe pagină)
  // ---------------------------------------------------------------

  function buildBreadcrumb() {
    const container = document.getElementById("breadcrumb");
    if (!container || !FizicaLiceu.data) return;

    const currentPath = normalizedCurrentPath();
    const segments = currentPath.split("/");
    const clasaId = segments[0];
    const clasa = getClasa(clasaId);
    if (!clasa) return;

    const base = FizicaLiceu.basePath;
    const crumbs = [{ href: base + "index.html", text: "Acasă" }];
    crumbs.push({ href: base + clasa.path, text: clasa.nume });

    if (segments[1] === "lectii" && segments[2]) {
      const cap = getCapitol(clasaId, segments[2]);
      if (cap) {
        crumbs.push({ href: base + cap.path, text: cap.nume });

        // dacă suntem pe o pagină de lecție individuală, adaugă și lecția
        const fname = segments[segments.length - 1];
        const lectie = cap.lectii.find((l) => l.path.endsWith("/" + fname));
        if (lectie && fname !== "index.html") {
          crumbs.push({ href: base + lectie.path, text: lectie.titlu });
        }
      }
    }

    container.innerHTML = "";
    crumbs.forEach((c, idx) => {
      if (idx > 0) {
        container.appendChild(document.createTextNode(" › "));
      }
      const isLast = idx === crumbs.length - 1;
      if (isLast) {
        const span = document.createElement("span");
        span.setAttribute("aria-current", "page");
        span.textContent = c.text;
        container.appendChild(span);
      } else {
        container.appendChild(link(c.href, c.text));
      }
    });
  }

  // ---------------------------------------------------------------
  // 5. Bare de progres declarative — orice element cu [data-progress]
  //    ex: <div data-progress="clasa10"></div>
  //        <div data-progress="clasa10.cinematica"></div>
  // ---------------------------------------------------------------

  function buildProgressWidgets() {
    if (!FizicaLiceu.data) return;
    const nodes = document.querySelectorAll("[data-progress]");

    nodes.forEach((node) => {
      const key = node.getAttribute("data-progress");
      const [clasaId, capitolId] = key.split(".");
      const clasa = getClasa(clasaId);
      if (!clasa) return;

      let total, complete, label;
      if (capitolId) {
        const cap = getCapitol(clasaId, capitolId);
        if (!cap) return;
        total = cap.numarLectii;
        complete = cap.lectiiComplete;
        label = cap.nume;
      } else {
        const p = progresClasa(clasa);
        total = p.total;
        complete = p.complete;
        label = clasa.nume;
      }

      const pct = total > 0 ? Math.round((complete / total) * 100) : 0;

      node.innerHTML = "";
      node.classList.add("fl-progress");

      const track = document.createElement("div");
      track.className = "fl-progress__track";
      const bar = document.createElement("div");
      bar.className = "fl-progress__bar";
      bar.style.width = pct + "%";
      track.appendChild(bar);

      const text = document.createElement("small");
      text.className = "fl-progress__text";
      text.textContent = `${label}: ${complete}/${total} lecții (${pct}%)`;

      node.appendChild(track);
      node.appendChild(text);
    });
  }

  // ---------------------------------------------------------------
  // 6. Utilitare
  // ---------------------------------------------------------------

  // Calea curentă, normalizată relativ la rădăcina site-ului
  // (elimină prefixul de foldere superioare calculat la încărcarea datelor).
  function normalizedCurrentPath() {
    let path = window.location.pathname;
    // păstrează doar segmentul de după ultimul folder cunoscut ca rădăcină
    // (funcționează atât pe GitHub Pages cât și local)
    const marker = "/fizica-liceu";
    const idx = path.indexOf(marker);
    if (idx !== -1) {
      path = path.slice(idx + marker.length);
    }
    path = path.replace(/^\/+/, "");
    if (path === "" || path.endsWith("/")) path += "index.html";
    return path;
  }

  // ---------------------------------------------------------------
  // 7. Inițializare
  // ---------------------------------------------------------------

  async function init() {
    await loadData();
    if (!FizicaLiceu.data) return;
    buildNav();
    buildBreadcrumb();
    buildProgressWidgets();
    document.dispatchEvent(new CustomEvent("fizicaliceu:ready", { detail: FizicaLiceu.data }));
  }

  FizicaLiceu.ready = init();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {}); // no-op, init already scheduled via promise
  }
})();
