/* =========================================================
   Signed number input
   Permite introducerea valorilor negative pe dispozitive
   mobile ale căror tastaturi numerice nu afișează semnul -.
   Utilizare:
   <input type="number" data-signed-number>
   ========================================================= */

(function () {
    "use strict";

    function enhanceSignedNumberInput(input) {
        if (input.dataset.signedNumberReady === "true") {
            return;
        }

        if (input.type !== "number") {
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "signed-number-field";

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const button = document.createElement("button");

        button.type = "button";
        button.className = "signed-number-toggle";
        button.textContent = "±";

        button.setAttribute(
            "aria-label",
            input.dataset.signLabel || "Schimbă semnul valorii"
        );

        button.title = "Schimbă semnul valorii";

        wrapper.appendChild(button);

        button.addEventListener("click", function () {
            if (input.disabled || input.readOnly) {
                return;
            }

            if (input.value === "") {
                input.focus();
                return;
            }

            const value = input.valueAsNumber;

            if (!Number.isFinite(value)) {
                input.focus();
                return;
            }

            input.value = String(-value);

            /*
             * Anunțăm și eventualele scripturi ale experimentului
             * că valoarea s-a modificat.
             */
            input.dispatchEvent(
                new Event("input", {
                    bubbles: true
                })
            );

            input.dispatchEvent(
                new Event("change", {
                    bubbles: true
                })
            );

            input.focus();
        });

        input.dataset.signedNumberReady = "true";
    }


    function initSignedNumberInputs(root = document) {
        root.querySelectorAll(
            'input[type="number"][data-signed-number]'
        ).forEach(enhanceSignedNumberInput);
    }


    function init() {
        initSignedNumberInputs();

        /*
         * Suport și pentru câmpuri create ulterior din JavaScript,
         * de exemplu tabele sau măsurători generate dinamic.
         */
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (!(node instanceof Element)) {
                        return;
                    }

                    if (
                        node.matches &&
                        node.matches(
                            'input[type="number"][data-signed-number]'
                        )
                    ) {
                        enhanceSignedNumberInput(node);
                    }

                    initSignedNumberInputs(node);
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }


    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    /*
     * Expunem funcția și global, în caz că un experiment
     * dorește să inițializeze manual o anumită zonă.
     */
    window.initSignedNumberInputs = initSignedNumberInputs;
})();
