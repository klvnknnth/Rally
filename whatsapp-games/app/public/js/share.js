/* Rally share helpers — WhatsApp deep link, system share sheet, clipboard. */
(function (root) {
  const Share = {};

  Share.waUrl = text => `https://wa.me/?text=${encodeURIComponent(text)}`;

  Share.toWhatsApp = function (text) {
    window.open(Share.waUrl(text), '_blank', 'noopener');
  };

  Share.copy = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      return ok;
    }
  };

  Share.native = async function (text, url) {
    if (!navigator.share) return false;
    try {
      await navigator.share({ text, url });
      return true;
    } catch (e) {
      return false;
    }
  };

  root.RallyShare = Share;
})(typeof self !== 'undefined' ? self : globalThis);
