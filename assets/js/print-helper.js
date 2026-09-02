document.addEventListener("DOMContentLoaded", function() {
    if (!document.querySelector('.btn-print')) {
        const printButton = document.createElement('button');
        printButton.innerHTML = '🖨️ Printează / Salvează PDF';
        printButton.className = 'btn-print';
        printButton.onclick = function() {
            window.print();
        };

        const targetContainer = document.querySelector('main') || document.querySelector('.content') || document.body;
        targetContainer.insertBefore(printButton, targetContainer.firstChild);
    }
});
