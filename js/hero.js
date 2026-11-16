// Homepage hero: letter-by-letter headline entrance and pointer parallax.
// Everything here is progressive: without this script the hero is already complete and readable.
(function () {
  var hero = document.getElementById('heroTalk');
  if (!hero) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function splitTitle() {
    var title = document.getElementById('heroTitle');
    if (!title || reduce) return;
    var delay = 0;
    var copy = title.cloneNode(true);
    copy.querySelectorAll('br').forEach(function (br) { br.parentNode.replaceChild(document.createTextNode(' '), br); });
    title.setAttribute('aria-label', copy.textContent.replace(/\s+/g, ' ').trim());

    function splitNode(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var word = document.createElement('span');
            word.className = 'wd';
            word.setAttribute('aria-hidden', 'true');
            for (var i = 0; i < part.length; i++) {
              var ch = document.createElement('span');
              ch.className = 'ch';
              ch.textContent = part.charAt(i);
              ch.style.webkitAnimationDelay = ch.style.animationDelay = (150 + delay * 30) + 'ms';
              delay++;
              word.appendChild(ch);
            }
            frag.appendChild(word);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          splitNode(child);
        }
      });
    }
    splitNode(title);
  }

  function play() {
    hero.classList.remove('is-playing');
    void hero.offsetWidth;
    hero.classList.add('is-playing');
  }

  function start() {
    splitTitle();
    if (!reduce) play();
  }

  // i18n.js fills the headline on DOMContentLoaded (its listener runs first) and on every
  // language switch; re-split and replay after each fill.
  document.addEventListener('em:lang', function () { start(); });
  if (document.readyState !== 'loading') start();

  // Pointer parallax on devices with a real mouse only.
  var stage = document.getElementById('talkStage');
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!stage || reduce || !fine) return;
  var layers = stage.querySelectorAll('.talk-layer');
  var pending = false, mx = 0, my = 0;
  function render() {
    pending = false;
    layers.forEach(function (layer) {
      var d = parseFloat(layer.getAttribute('data-depth')) || 0;
      var t = 'translate(' + (mx * d).toFixed(1) + 'px,' + (my * d).toFixed(1) + 'px)';
      layer.style.webkitTransform = t;
      layer.style.transform = t;
    });
  }
  hero.addEventListener('mousemove', function (e) {
    var r = hero.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
    if (!pending) { pending = true; (window.requestAnimationFrame || setTimeout)(render); }
  });
  hero.addEventListener('mouseleave', function () { mx = 0; my = 0; render(); });
})();
