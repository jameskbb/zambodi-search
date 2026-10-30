// Fills every .wordmark on the page with the brand SVG.
(function () {
  document.querySelectorAll('.wordmark').forEach(function (el) {
    var img = document.createElement('img');
    img.src = '../../assets/logo/zambodi-logo.svg';
    img.alt = 'Zambodi';
    el.appendChild(img);
  });
})();
