/*
 * The phone surface's half of the offline layer. Loaded deferred by every /m page and optional:
 * with scripts off, or in a browser with no service worker, the pages behave exactly as before.
 *
 * Three jobs:
 *   1. Enrol the phone in the service worker (/sw.js).
 *   2. Say, in one bar at the bottom of the screen, what is kept on the phone and not yet sent,
 *      and what the reporter has to do about it. An answer that is saved but not sent looks
 *      exactly like one that was sent unless something says otherwise, and a reporter who
 *      believes a report went in when it did not is the failure the design document names.
 *   3. On a report's indicator pages, fetch every indicator once while there is signal, so a
 *      reporter who loses it can still move forward through the report.
 *
 * Plain script, no framework, no build step. It is fetched by phones on paid data.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').catch(function () {});

  var bar = null;
  var last = null;
  var hadPending = false;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  function ensureBar() {
    if (bar) return bar;
    var style = el('style', {});
    style.textContent =
      '.vk-bar{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:12px 16px;' +
      'background:var(--panel,#f4f8f6);color:var(--ink,#1a1a1a);border-top:3px solid var(--green,#0f3d2e);' +
      'font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
      '.vk-bar p{margin:0 auto;max-width:520px}.vk-bar .vk-acts{max-width:520px;margin:8px auto 0;display:flex;gap:10px}' +
      '.vk-bar a,.vk-bar button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;' +
      'border-radius:8px;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;' +
      'background:var(--green,#0f3d2e);color:var(--on-green,#fff);border:none}' +
      '.vk-bar button.ghost{background:transparent;color:var(--green,#0f3d2e);border:2px solid var(--line,#dfe6e3)}' +
      '.vk-bar a:focus-visible,.vk-bar button:focus-visible{outline:3px solid var(--ink,#1a1a1a);outline-offset:3px}' +
      'body.vk-has-bar{padding-bottom:120px}';
    document.head.appendChild(style);
    bar = el('div', { class: 'vk-bar', role: 'status', 'aria-live': 'polite', hidden: '' });
    document.body.appendChild(bar);
    return bar;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function render() {
    var b = ensureBar();
    var s = last || { pending: 0, failed: [], others: 0, signin: false, sending: false };
    var offline = !navigator.onLine;
    var text = null;
    var actions = [];

    if (s.failed.length > 0) {
      var f = s.failed[0];
      text = 'An answer kept on this phone was not accepted: ' + f.note +
        ' Nothing after it has been sent. Open it to correct it, or discard it.';
      actions.push({ href: f.formPage, label: 'Open it' });
      actions.push({ button: 'Discard', ghost: true, run: function () { post({ type: 'discard', id: f.id }); } });
    } else if (s.signin && s.pending > 0) {
      text = plural(s.pending, 'answer is', 'answers are') + ' kept on this phone. Sign in again to send ' + (s.pending === 1 ? 'it.' : 'them.');
      if (location.pathname.indexOf('/m/signin') !== 0) {
        actions.push({ href: '/m/signin?next=' + encodeURIComponent(location.pathname), label: 'Sign in' });
      }
    } else if (s.pending > 0 && s.sending) {
      text = 'Sending ' + plural(s.pending, 'answer', 'answers') + ' kept on this phone.';
    } else if (s.pending > 0) {
      text = plural(s.pending, 'answer is', 'answers are') + ' kept on this phone and not sent yet. ' +
        (offline ? 'They will be sent when the signal comes back.' : 'Sending as soon as the connection allows.');
      if (!offline) actions.push({ button: 'Send now', run: function () { post({ type: 'flush' }); } });
    } else if (offline) {
      text = 'No signal. You can keep going: answers are kept on this phone and sent when the signal comes back.';
    } else if (hadPending) {
      text = 'Everything kept on this phone has been sent.';
      setTimeout(function () { hadPending = false; render(); }, 6000);
    }
    if (s.others > 0 && !text) {
      text = 'Answers kept on this phone by another account are waiting for that person to sign in.';
    }
    if (s.pending > 0 || s.failed.length > 0) hadPending = true;

    b.textContent = '';
    if (!text) {
      b.hidden = true;
      document.body.classList.remove('vk-has-bar');
      return;
    }
    b.appendChild(el('p', {}, text));
    if (actions.length) {
      var row = el('div', { class: 'vk-acts' });
      actions.forEach(function (a) {
        var node;
        if (a.href) {
          node = el('a', { href: a.href }, a.label);
        } else {
          node = el('button', { type: 'button', class: a.ghost ? 'ghost' : '' }, a.button);
          node.addEventListener('click', a.run);
        }
        row.appendChild(node);
      });
      b.appendChild(row);
    }
    b.hidden = false;
    document.body.classList.add('vk-has-bar');
  }

  function post(message) {
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage(message);
    });
  }

  navigator.serviceWorker.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'vuka-outbox') {
      last = e.data;
      render();
    }
  });

  window.addEventListener('online', function () { render(); post({ type: 'flush' }); });
  window.addEventListener('offline', render);

  navigator.serviceWorker.ready.then(function () {
    // Only once the worker is really there does the page promise that answers survive no signal.
    var hint = document.querySelector('[data-offline-hint]');
    if (hint) {
      hint.textContent = 'Your answers are saved as you go. If you lose signal, keep going: each answer is kept on ' +
        'this phone and sent when the signal comes back. The bar at the bottom says how many are waiting.';
    }
    post({ type: 'status' });
    if (navigator.onLine) post({ type: 'flush' });

    // Every indicator of this report, and the page after the last one, which holds the submit form.
    var main = document.querySelector('[data-step-base][data-step-count]');
    var saveData = navigator.connection && navigator.connection.saveData;
    if (main && navigator.onLine && !saveData) {
      var base = main.getAttribute('data-step-base');
      var count = parseInt(main.getAttribute('data-step-count'), 10) || 0;
      var urls = [];
      for (var i = 0; i <= count; i++) urls.push(base + i);
      post({ type: 'warm', urls: urls });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
