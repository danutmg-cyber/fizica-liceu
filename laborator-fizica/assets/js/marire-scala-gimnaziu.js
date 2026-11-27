(() => {
  "use strict";

  for (const target of document.querySelectorAll("[data-lab-zoom]")) {
    const label = target.dataset.labZoom;
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = "Mărește " + label;
    button.setAttribute("aria-expanded", "false");
    if (!target.id) target.id = "lab-zoom-target";
    viewport.id = target.id + "-viewport";
    button.setAttribute("aria-controls", viewport.id);

    target.before(button, viewport);
    viewport.append(content);
    content.append(target);

    button.addEventListener("click", () => {
      const enlarged = button.getAttribute("aria-expanded") === "false";
      button.setAttribute("aria-expanded", String(enlarged));
      button.textContent = (enlarged ? "Micșorează " : "Mărește ") + label;
      viewport.style.overflow = enlarged ? "auto" : "";
      content.style.transformOrigin = "top left";
      content.style.transform = enlarged ? "scale(1.6)" : "";
      if (enlarged) {
        viewport.tabIndex = 0;
        viewport.setAttribute("role", "region");
        viewport.setAttribute("aria-label", "Vizualizare mărită");
        viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      } else {
        viewport.removeAttribute("tabindex");
        viewport.removeAttribute("role");
        viewport.removeAttribute("aria-label");
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      }
    });
  }
})();
