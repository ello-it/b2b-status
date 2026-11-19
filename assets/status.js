/* Page de statut ello business — tout le contenu vient de status.json.
   Ce fichier est publié depuis le dashboard hotline (onglet B2B), qui le commite
   dans ce dépôt via l'API GitHub : ne pas éditer le HTML pour changer un statut.
   Dates stockées en heure suisse, format "AAAA-MM-JJTHH:MM", sans fuseau. */
(function () {
  'use strict';

  var HISTORY_DAYS = 14;
  var REFRESH_MS   = 60 * 1000;

  var SERVICE_STATUS = {
    ok:          { label: 'Opérationnel',           cls: 'ok' },
    degraded:    { label: 'Perturbation partielle', cls: 'warn' },
    outage:      { label: 'Panne',                  cls: 'danger' },
    maintenance: { label: 'Maintenance',            cls: 'info' }
  };
  var SEVERITY = {
    outage:   { label: 'Panne',        cls: 'danger' },
    degraded: { label: 'Perturbation', cls: 'warn' }
  };
  var STAGES = [
    { id: 'investigating', label: 'Analyse en cours',           cls: 'neutral' },
    { id: 'identified',    label: 'Cause identifiée',           cls: 'warn' },
    { id: 'monitoring',    label: 'Rétabli, sous surveillance', cls: 'info' },
    { id: 'resolved',      label: 'Résolu',                     cls: 'ok' }
  ];
  var OVERALL = {
    danger: 'Panne en cours',
    warn:   'Perturbation en cours',
    info:   'Maintenance en cours',
    ok:     'Tous les services sont opérationnels'
  };
  var DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  // ── Helpers ────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function pill(cls, label) { return '<span class="pill ' + cls + '">' + esc(label) + '</span>'; }
  function stageOf(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i;
    return 0;
  }
  function severityOf(inc) { return SEVERITY[inc.severity] || SEVERITY.degraded; }

  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function fmtTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmt(s) { var d = parse(s); return d ? fmtDate(d) + ', ' + fmtTime(d) : ''; }
  function fmtRange(a, b) {
    var d1 = parse(a), d2 = parse(b);
    if (!d1) return '';
    var out = DAYS[d1.getDay()] + ' ' + fmtDate(d1) + ', ' + fmtTime(d1);
    if (d2) out += fmtDate(d1) === fmtDate(d2)
      ? ' – ' + fmtTime(d2)
      : ' – ' + DAYS[d2.getDay()] + ' ' + fmtDate(d2) + ', ' + fmtTime(d2);
    return out;
  }
  function fmtDuration(a, b) {
    var d1 = parse(a), d2 = parse(b);
    if (!d1 || !d2) return '';
    var min = Math.max(0, Math.round((d2 - d1) / 60000));
    var h = Math.floor(min / 60), m = min % 60;
    if (h >= 24) return Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
    return h ? h + ' h ' + pad(m) : m + ' min';
  }

  function serviceNames(data, ids) {
    var byId = {}, out = [];
    (data.services || []).forEach(function (s) { byId[s.id] = s.name; });
    (ids || []).forEach(function (id) { if (byId[id]) out.push(byId[id]); });
    return out.join(', ');
  }
  function byDesc(key) { return function (a, b) { return (b[key] || '') < (a[key] || '') ? -1 : 1; }; }

  function activeIncidents(data) {
    return (data.incidents || []).filter(function (i) { return i.stage !== 'resolved'; })
      .sort(byDesc('started'));
  }
  function upcomingMaintenances(data, now) {
    return (data.maintenances || []).filter(function (m) { var e = parse(m.end); return e && e > now; })
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }
  function isRunning(m, now) { var s = parse(m.start); return s && s <= now; }

  function meta(items) {
    return '<div class="meta">' + items.filter(function (it) { return it[1]; }).map(function (it) {
      return '<span>' + esc(it[0]) + ' : <b>' + esc(it[1]) + '</b></span>';
    }).join('') + '</div>';
  }

  function renderChrome(data) {
    $('test-banner').hidden = !data.test_mode;
    var u = parse(data.updated);
    $('updated').textContent = u ? 'Page mise à jour le ' + fmtDate(u) + ' à ' + fmtTime(u) : '';
  }

  // ── Page d'accueil ─────────────────────────────────────────────────────
  function renderIndex(data) {
    var now = new Date();
    var active = activeIncidents(data);
    var maint  = upcomingMaintenances(data, now);
    var svc    = data.services || [];
    function svcHas(st) { return svc.some(function (s) { return s.status === st; }); }

    var level = 'ok';
    if (svcHas('outage') || active.some(function (i) { return i.severity === 'outage'; })) level = 'danger';
    else if (svcHas('degraded') || active.length) level = 'warn';
    else if (svcHas('maintenance') || maint.some(function (m) { return isRunning(m, now); })) level = 'info';

    var text = data.message;
    if (!text) {
      if (level === 'ok') text = 'Aucun incident en cours.';
      else if (level === 'info') text = 'Une maintenance planifiée est en cours. De brèves interruptions sont possibles.';
      else if (active.length === 1) text = 'Un incident est en cours, voir le détail ci-dessous. Les autres services fonctionnent normalement.';
      else if (active.length > 1) text = active.length + ' incidents sont en cours, voir le détail ci-dessous.';
      else text = 'Certains services sont perturbés. Nos équipes sont mobilisées.';
    }
    var ov = $('overall');
    ov.className = 'overall ' + level;
    ov.innerHTML = '<span class="dot" aria-hidden="true"></span><div><strong>' + esc(OVERALL[level]) +
      '</strong><p>' + esc(text) + '</p></div>';

    $('incidents').innerHTML = active.length ? active.map(function (inc) {
      var sev = severityOf(inc), st = STAGES[stageOf(inc.stage)];
      var href = 'incident.html?id=' + encodeURIComponent(inc.id);
      return '<article class="card accent-' + sev.cls + '">' +
        '<div class="pills">' + pill(sev.cls, sev.label) + pill(st.cls, st.label) + '</div>' +
        '<h3><a href="' + href + '">' + esc(inc.title) + '</a></h3>' +
        meta([['Réf.', inc.id], ['Services', serviceNames(data, inc.services)],
              ['Zone', inc.zone], ['Depuis', fmt(inc.started)]]) +
        (inc.summary ? '<p>' + nl2br(inc.summary) + '</p>' : '') +
        '<a class="more" href="' + href + '">Suivre l\'incident &rarr;</a>' +
        '</article>';
    }).join('') : '<div class="empty">Aucun incident en cours.</div>';

    $('maintenances').innerHTML = maint.length ? maint.map(function (m) {
      var running = isRunning(m, now);
      return '<article class="card accent-info" id="' + esc(m.id) + '">' +
        '<div class="pills">' + pill('info', 'Maintenance') +
          (running ? pill('warn', 'En cours') : pill('neutral', 'Planifiée')) + '</div>' +
        '<h3>' + esc(m.title) + '</h3>' +
        meta([['Réf.', m.id], ['Quand', fmtRange(m.start, m.end)],
              ['Services', serviceNames(data, m.services)], ['Zone', m.zone]]) +
        (m.text ? '<p>' + nl2br(m.text) + '</p>' : '') +
        '</article>';
    }).join('') : '<div class="empty">Aucune maintenance planifiée.</div>';

    $('services').innerHTML = svc.map(function (s) {
      var st = SERVICE_STATUS[s.status] || SERVICE_STATUS.ok;
      return '<li><span>' + esc(s.name) + '</span>' + pill(st.cls, st.label) + '</li>';
    }).join('');

    var since = new Date(now.getTime() - HISTORY_DAYS * 86400000);
    var past = (data.incidents || []).filter(function (i) {
      var r = parse(i.resolved);
      return i.stage === 'resolved' && r && r >= since;
    }).sort(byDesc('resolved'));
    $('history').innerHTML = past.length ? past.map(function (i) {
      var r = parse(i.resolved);
      return '<li><a href="incident.html?id=' + encodeURIComponent(i.id) + '">' + esc(i.title) + '</a>' +
        '<time datetime="' + esc(i.resolved) + '">' + fmtDate(r) + ' · résolu en ' + fmtDuration(i.started, i.resolved) +
        '</time></li>';
    }).join('') : '<li class="muted">Aucun incident ces ' + HISTORY_DAYS + ' derniers jours.</li>';
  }

  // ── Page d'un incident ─────────────────────────────────────────────────
  function renderIncident(data) {
    var id = new URLSearchParams(location.search).get('id');
    var inc = null;
    (data.incidents || []).forEach(function (i) { if (i.id === id) inc = i; });
    var main = $('incident');
    if (!inc) {
      main.innerHTML = '<h1>Incident introuvable</h1><p class="muted">Cet incident n\'existe pas ou n\'est plus affiché.</p>';
      return;
    }
    document.title = inc.title + ' — Statut ello business';
    var sev = severityOf(inc), idx = stageOf(inc.stage), st = STAGES[idx];
    var resolved = inc.stage === 'resolved';
    var updates = (inc.updates || []).slice().sort(byDesc('at'));
    var last = updates.length ? updates[0].at : inc.started;
    var lastD = parse(last);

    var facts = [['Services touchés', serviceNames(data, inc.services)], ['Zone', inc.zone], ['Début', fmt(inc.started)]];
    if (resolved) facts.push(['Fin', fmt(inc.resolved) + (inc.resolved ? ' (durée ' + fmtDuration(inc.started, inc.resolved) + ')' : '')]);
    else facts.push(['Rétablissement estimé', inc.eta]);

    main.innerHTML =
      '<div class="incident-head"><div class="pills">' + pill(sev.cls, sev.label) +
        pill(st.cls, resolved ? 'Résolu' : 'En cours · ' + st.label) + '</div>' +
        '<h1>' + esc(inc.title) + '</h1>' +
        '<p class="muted small">Réf. <b>' + esc(inc.id) + '</b>' +
          (lastD ? ' · Dernière mise à jour : ' + fmtDate(lastD) + ' à ' + fmtTime(lastD) : '') + '</p>' +
        (inc.summary ? '<p class="summary">' + nl2br(inc.summary) + '</p>' : '') + '</div>' +
      '<ol class="steps" aria-label="Avancement de l\'incident">' + STAGES.map(function (s, i) {
        var cls = (i <= idx ? 'done' : '') + (i === idx ? ' current' : '');
        return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + esc(s.label) + '</li>';
      }).join('') + '</ol>' +
      '<dl class="facts">' + facts.filter(function (f) { return f[1]; }).map(function (f) {
        return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
      }).join('') + '</dl>' +
      (resolved ? '' :
        '<div class="advice"><strong>Ce que vous pouvez faire</strong><ul>' +
        '<li>Si votre site dispose d\'un lien de secours, il a dû prendre le relais automatiquement.</li>' +
        '<li>Les contacts techniques enregistrés chez nous sont informés par e-mail à chaque étape, jusqu\'au rétablissement.</li>' +
        '<li>Si vous constatez un impact qui ne figure pas ici, contactez le support business en citant la référence ' + esc(inc.id) + '.</li>' +
        '</ul></div>') +
      (updates.length ? '<h2>Historique de l\'incident</h2><ol class="timeline">' + updates.map(function (u) {
        var us = STAGES[stageOf(u.stage)];
        return '<li><div class="when">' + esc(fmt(u.at)) + ' ' + pill(us.cls, us.label) + '</div><p>' + nl2br(u.text) + '</p></li>';
      }).join('') + '</ol>' : '');
  }

  // ── Chargement ─────────────────────────────────────────────────────────
  var page = document.body.getAttribute('data-page');
  var loaded = false;

  function load() {
    // Paramètre anti-cache : GitHub Pages sert les fichiers avec 10 min de cache CDN.
    fetch('status.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        renderChrome(data);
        if (page === 'incident') renderIncident(data); else renderIndex(data);
        loaded = true;
      })
      .catch(function () {
        // Échec d'un rafraîchissement : on garde le dernier état affiché.
        if (loaded) return;
        var box = $(page === 'incident' ? 'incident' : 'overall');
        if (box) {
          box.className = page === 'incident' ? '' : 'overall warn';
          box.innerHTML = '<div><strong>État des services indisponible</strong><p>Impossible de charger les informations. ' +
            'En cas de problème, contactez le support au 032 729 98 98.</p></div>';
        }
      });
  }
  load();
  setInterval(load, REFRESH_MS);
})();
