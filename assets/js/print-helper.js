document.addEventListener("DOMContentLoaded", function() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        if (!page.querySelector('.btn-print')) {
            const printButton = document.createElement('button');
            printButton.innerHTML = '🖨️ Printează / Salvează PDF';
            printButton.className = 'btn-print';
            printButton.onclick = function() {
                window.print();
            };
            page.insertBefore(printButton, page.firstChild);
        }
    });
});
