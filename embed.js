/**
 * EP Training Map — US map of upcoming Election Protection trainings, by state.
 *
 * Served by the Flask app at trainingmap.electionprotectiontools.org, behind
 * ccef-auth. It began life as a GitHub Pages embed for a public WordPress
 * page; what it is now is a staff tool, which is why the panel carries Zoom
 * links, host contacts and signup counts that a world-readable file could
 * never have held.
 *
 * Required attributes on the mount div (the template sets all three):
 *   data-api    the trainings endpoint   (/api/trainings)
 *   data-geo    the state geometry       (/static/us-states.json)
 *   data-login  where to send an expired session
 *
 * No dependencies, no build step. Geometry and training data are two separate
 * fetches so the (static) map caches independently of the (nightly) data.
 */
(function () {
  "use strict";

  var MOUNT_ID = "cc-ep-training-map";
  var NS = "cetm";                       // class prefix, scoped under the mount

  var mount = document.getElementById(MOUNT_ID);
  if (!mount) {
    console.warn("[ep-training-map] no #" + MOUNT_ID + " element on the page");
    return;
  }

  // Read from the mount rather than derived from this script's own src, which
  // is what the Pages embed did. The app knows its own routes; a regex over a
  // script URL only ever guessed at them.
  var dataSrc = mount.getAttribute("data-api") || "/api/trainings";
  var geoSrc = mount.getAttribute("data-geo") || "/static/us-states.json";
  var loginUrl = mount.getAttribute("data-login") || "/auth/login";

  // The public coalition map (GitHub Pages, built by
  // scripts/publish_public.py) sets data-public. Its payload has no staff
  // block at all, since ep_training_map.public allowlists fields. This flag
  // only changes the COPY: staff-facing hints ("check the PTV sweep", "who's
  // hosting") mean nothing to a coalition partner. Hiding a field here is
  // never the safeguard; leaving it out of the payload is.
  var isPublic = mount.getAttribute("data-public") === "true";

  // The public map lives in an iframe on protectthevote.net, and its height
  // changes a lot: an open state panel docks below the map on a phone and can
  // be several screens tall. So it reports its own height to the host page,
  // and the snippet in ep-training-map-public/docs/wordpress_embed.md sizes
  // the iframe to match. Without the listener the iframe keeps its fixed
  // height and scrolls inside, which still works, just less well. Nothing
  // but a number is sent.
  if (isPublic && window.parent !== window) {
    var lastHeight = 0;
    var reportHeight = function () {
      var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
      if (h && h !== lastHeight) {
        lastHeight = h;
        window.parent.postMessage({ type: "ep-training-map:height", height: h }, "*");
      }
    };
    if (window.ResizeObserver) {
      new ResizeObserver(reportHeight).observe(document.documentElement);
    } else {
      window.addEventListener("resize", reportHeight);
      setInterval(reportHeight, 1000);
    }
    window.addEventListener("load", reportHeight);
  }

  // Small jurisdictions get a labelled chip in the Atlantic with a leader line.
  // Without it DC is under 3 real pixels wide and RI about 10 — unclickable,
  // and both are live EP states. Ordered north to south to keep leaders tidy.
  var CALLOUTS = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD", "DC"];
  var CHIP = { x: 992, w: 84, h: 26, top: 116, pitch: 30 };
  var VIEWBOX = "-62 8 1150 604";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // --- Helpers --------------------------------------------------------------

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /** Only http(s) becomes a link. Training names and URLs are upstream,
   *  user-entered fields; a javascript: URL must never reach an href. */
  function safeUrl(u) {
    if (!u) return "";
    return /^https?:\/\//i.test(String(u).trim()) ? String(u).trim() : "";
  }

  /** '2026-09-09' -> {dow:'Wed', label:'Sep 9'}. Parsed as a local calendar
   *  date, NOT via new Date(iso) — that reads as UTC and shifts a day back in
   *  every US timezone, which is exactly the wrong error near an election. */
  function parseDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return {
      dow: DAYS[d.getDay()],
      label: MONTHS[+m[2] - 1] + " " + (+m[3]),
      iso: iso,
      date: d
    };
  }

  function todayLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  /** Sessions a volunteer could still attend, for the map + picker counts. */
  function countSessions(items) {
    return (items || []).reduce(function (acc, t) {
      return acc + ((t.sessions || []).length || (t.on_demand ? 1 : 0));
    }, 0);
  }

  /** The fields this tool needs a login for: signups, host contact, join link.
   *
   *  Kept in its own block rather than mixed into the lines above it, so which
   *  half of a card must not be pasted into a public channel stays obvious at
   *  a glance. Everything here is in PUBLIC_DENY on the Python side.
   */
  function staffBlock(s) {
    if (!s) return "";
    var rows = [];

    // Both counts are shown and both are labelled. They come from different
    // systems and routinely disagree; collapsing them into one "registrations"
    // figure would invent a precision neither number has.
    var stats = [];
    if (s.signups) {
      stats.push("<b>" + esc(s.signups) + "</b> signup"
        + (s.signups === 1 ? "" : "s"));
    }
    if (s.registrations_total) {
      stats.push("<b>" + esc(s.registrations_total)
        + "</b> registered <span>(source total)</span>");
    }
    if (stats.length) {
      rows.push('<div class="' + NS + '-sStat">' + stats.join(" · ") + "</div>");
    }

    if (s.host_email) {
      rows.push('<div class="' + NS + '-sRow"><span class="' + NS
        + '-sKey">Host</span> <a href="mailto:' + esc(s.host_email) + '">'
        + esc(s.host_email) + "</a></div>");
    }

    var links = [];
    var zoom = safeUrl(s.zoom_link);
    if (zoom) {
      links.push('<a class="' + NS + "-sLink " + NS + '-sSensitive" href="'
        + esc(zoom) + '" target="_blank" rel="noopener" '
        + 'title="Live join link — never paste this into a public channel">'
        + "Join link</a>");
    }
    var quiz = safeUrl(s.quiz_link);
    if (quiz) {
      links.push('<a class="' + NS + '-sLink" href="' + esc(quiz)
        + '" target="_blank" rel="noopener">Quiz</a>');
    }
    var rec = safeUrl(s.recording_link);
    if (rec) {
      links.push('<a class="' + NS + '-sLink" href="' + esc(rec)
        + '" target="_blank" rel="noopener">Recording</a>');
    }
    if (links.length) {
      rows.push('<div class="' + NS + '-sRow">' + links.join("") + "</div>");
    }

    // The upstream key. "Trace it upstream first" is the standing instruction
    // for anything that looks wrong here, and this is what you trace with.
    if (s.training_id) {
      rows.push('<div class="' + NS + '-sId">' + esc(s.training_id) + "</div>");
    }

    if (!rows.length) return "";
    return '<div class="' + NS + '-staff">' + rows.join("") + "</div>";
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) {
        e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  // --- Load -----------------------------------------------------------------

  /** credentials:"same-origin" is load-bearing — every endpoint here is behind
   *  the ccef-auth session cookie, and the Pages version's "omit" would get a
   *  401 on both fetches. */
  function getJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) {
        var e = new Error(url + " -> HTTP " + r.status);
        e.status = r.status;
        throw e;
      }
      return r.json();
    });
  }

  mount.appendChild(el("div", NS + "-loading", "Loading training map…"));

  Promise.all([getJson(geoSrc), getJson(dataSrc)])
    .then(function (res) { render(res[0], res[1]); })
    .catch(function (err) {
      console.error("[ep-training-map]", err);

      // A session that expired while the tab sat open. ccef-auth answers /api/*
      // with 401 JSON rather than a redirect precisely so this is detectable —
      // an HTML login page arriving at fetch() would surface as a JSON parse
      // error and read like a broken deploy.
      if (err && err.status === 401 && !isPublic) {
        window.location.href = loginUrl + "?next="
          + encodeURIComponent(window.location.pathname);
        return;
      }

      mount.innerHTML = "";
      mount.classList.add(NS + "-root");
      var m = el("div", NS + "-error");
      if (isPublic) {
        m.appendChild(el("p", null, "We couldn’t load the training map just now."));
        m.appendChild(el("p", null, "Please try again in a few minutes."));
      } else if (err && err.status === 503) {
        // Distinct from a generic failure on purpose: this one is an upstream
        // pipeline problem with a named owner, not a bug on this page.
        m.appendChild(el("p", null,
          "<strong>No schedule has been published yet.</strong>"));
        m.appendChild(el("p", null,
          "The scheduled <em>EP Training Map Publish</em> task hasn’t written a "
          + "payload. Check that run before looking at this page — an empty map "
          + "here is almost always an upstream failure."));
      } else {
        m.appendChild(el("p", null, "We couldn’t load the training map just now."));
        m.appendChild(el("p", null,
          "Reload the page; if it keeps failing, check the app logs on Render."));
      }
      mount.appendChild(m);
    });

  // --- Render ---------------------------------------------------------------

  function render(geo, data) {
    var states = (data && data.states) || {};
    var meta = (data && data._meta) || {};

    // Classify every jurisdiction for the choropleth.
    var cls = {};
    Object.keys(geo).forEach(function (code) {
      var items = states[code] || [];
      if (!items.length) { cls[code] = "none"; return; }
      var scheduled = items.some(function (t) {
        return !t.on_demand && (t.sessions || []).length;
      });
      cls[code] = scheduled ? "has" : "ondemand";
    });

    var withAny = Object.keys(states).filter(function (c) {
      return (states[c] || []).length;
    });

    mount.innerHTML = "";
    mount.classList.add(NS + "-root");

    // ---- header
    var head = el("div", NS + "-head");
    head.appendChild(el("h2", NS + "-title",
      "Election Protection trainings by state"));
    var counts = meta.counts || {};
    head.appendChild(el("p", NS + "-sub",
      (isPublic
        ? "Pick a state to see what’s on its schedule."
        : "Pick a state to see what’s on its schedule, who’s hosting, and how "
          + "registration is tracking.")
      + (counts.sessions
        ? " <strong>" + counts.sessions + "</strong> upcoming session"
          + (counts.sessions === 1 ? "" : "s") + " in <strong>"
          + withAny.length + "</strong> state"
          + (withAny.length === 1 ? "" : "s") + "."
        : "")));
    mount.appendChild(head);

    // ---- state picker (precision, and the accessible path on any screen)
    var controls = el("div", NS + "-controls");
    var label = el("label", NS + "-sronly", "Choose a state");
    label.setAttribute("for", NS + "-select");
    var select = el("select", NS + "-select");
    select.id = NS + "-select";
    var opt0 = el("option", null, "Choose a state…");
    opt0.value = "";
    select.appendChild(opt0);
    Object.keys(geo).sort(function (a, b) {
      return geo[a].name.localeCompare(geo[b].name);
    }).forEach(function (code) {
      var items = states[code] || [];
      var n = countSessions(items);
      var onlyOnDemand = items.length && items.every(function (t) {
        return t.on_demand;
      });
      var suffix = "";
      if (items.length) {
        suffix = onlyOnDemand
          ? " — on demand"
          : " — " + n + " session" + (n === 1 ? "" : "s");
      }
      var o = el("option", null, esc(geo[code].name) + suffix);
      o.value = code;
      select.appendChild(o);
    });
    controls.appendChild(label);
    controls.appendChild(select);
    mount.appendChild(controls);

    // ---- map + panel share a positioning context
    var stage = el("div", NS + "-stage");
    var svg = svgEl("svg", {
      viewBox: VIEWBOX,
      class: NS + "-map",
      role: "group",
      "aria-label": "Map of Election Protection trainings by state"
    });

    function tooltip(code) {
      var n = countSessions(states[code]);
      if (!n) return geo[code].name + " — none scheduled";
      var onlyOnDemand = (states[code] || []).every(function (t) {
        return t.on_demand;
      });
      return geo[code].name + " — "
        + (onlyOnDemand ? "available on demand"
          : n + " session" + (n === 1 ? "" : "s"));
    }

    var paths = {};
    var gStates = svgEl("g", { class: NS + "-states" });
    // Draw in a stable order so focus order is alphabetical, not file order.
    Object.keys(geo).sort().forEach(function (code) {
      var p = svgEl("path", {
        d: geo[code].d,
        class: NS + "-st " + NS + "-" + cls[code],
        "data-state": code
      });
      var t = svgEl("title", {});
      t.textContent = tooltip(code);
      p.appendChild(t);
      // Only states with something to show are keyboard stops; the rest stay
      // reachable through the dropdown, so tab order isn't 51 dead stops.
      if ((states[code] || []).length) {
        p.setAttribute("tabindex", "0");
        p.setAttribute("role", "button");
      }
      gStates.appendChild(p);
      paths[code] = p;
    });
    svg.appendChild(gStates);

    // ---- callout chips for jurisdictions too small to click
    var gCall = svgEl("g", { class: NS + "-callouts" });
    CALLOUTS.forEach(function (code, idx) {
      if (!geo[code]) return;
      var y = CHIP.top + idx * CHIP.pitch;
      var bb = geo[code].bbox;
      var cx = (bb[0] + bb[2]) / 2;
      var cy = (bb[1] + bb[3]) / 2;

      gCall.appendChild(svgEl("line", {
        class: NS + "-leader",
        x1: cx, y1: cy, x2: CHIP.x - 4, y2: y + CHIP.h / 2
      }));

      var g = svgEl("g", {
        class: NS + "-chip " + NS + "-" + cls[code],
        "data-state": code
      });
      if ((states[code] || []).length) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
      }
      g.appendChild(svgEl("rect", {
        x: CHIP.x, y: y, width: CHIP.w, height: CHIP.h, rx: 4
      }));
      var n = countSessions(states[code]);
      var txt = svgEl("text", {
        x: CHIP.x + CHIP.w / 2, y: y + CHIP.h / 2,
        "text-anchor": "middle", "dominant-baseline": "central"
      });
      txt.textContent = code + (n ? "  " + n : "");
      g.appendChild(txt);
      var ct = svgEl("title", {});
      ct.textContent = tooltip(code);
      g.appendChild(ct);
      gCall.appendChild(g);
    });
    svg.appendChild(gCall);
    stage.appendChild(svg);

    var panel = el("div", NS + "-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Trainings in the selected state");
    panel.hidden = true;
    stage.appendChild(panel);
    mount.appendChild(stage);

    // ---- legend
    var legend = el("div", NS + "-legend");
    [["has", "Trainings scheduled"],
     ["ondemand", "Available on demand"],
     ["none", "None scheduled yet"]].forEach(function (pair) {
      legend.appendChild(el("span", NS + "-key",
        '<i class="' + NS + "-sw " + NS + "-" + pair[0] + '"></i>'
        + esc(pair[1])));
    });
    mount.appendChild(legend);

    var stamp = String(meta.generated_at || "").slice(0, 10);
    mount.appendChild(el("p", NS + "-foot",
      "Times shown are local to each training."
      + (stamp ? " Updated " + esc(stamp) + "." : "")));

    // --- Selection ----------------------------------------------------------

    var selected = null;

    function clearSelection() {
      Object.keys(paths).forEach(function (c) {
        paths[c].classList.remove(NS + "-sel");
      });
      Array.prototype.forEach.call(
        svg.querySelectorAll("." + NS + "-chip"), function (g) {
          g.classList.remove(NS + "-sel");
        });
    }

    function closePanel() {
      panel.hidden = true;
      panel.innerHTML = "";
      selected = null;
      clearSelection();
      if (select.value !== "") select.value = "";
      syncUrl(null);
    }

    function selectState(code, viaKeyboard) {
      if (!geo[code]) return;
      selected = code;
      clearSelection();
      if (paths[code]) paths[code].classList.add(NS + "-sel");
      var chip = svg.querySelector("." + NS + "-chip[data-state='" + code + "']");
      if (chip) chip.classList.add(NS + "-sel");
      if (select.value !== code) select.value = code;
      buildPanel(code);
      panel.hidden = false;
      positionPanel(code);
      syncUrl(code);
      if (viaKeyboard) {
        var close = panel.querySelector("." + NS + "-close");
        if (close) close.focus();
      }
    }

    function buildPanel(code) {
      var items = (states[code] || []).slice();
      var html = '<button type="button" class="' + NS
        + '-close" aria-label="Close">&times;</button>'
        + '<div class="' + NS + '-pTitle">' + esc(geo[code].name) + "</div>";

      if (!items.length) {
        // Most states are in this position most of the time — 8 of 51 had
        // upcoming trainings on 2026-09-02 — so this is a primary surface,
        // not an edge case. It says where to look rather than just "none".
        html += isPublic
          ? '<p class="' + NS + '-empty">Nothing on the schedule here yet. '
            + "New trainings are added as they’re scheduled.</p>"
          : '<p class="' + NS + '-empty">Nothing on the schedule here. '
            + "A state with trainings running that don’t appear is usually an "
            + "upstream gap — check the PTV sweep and "
            + "<code>training_event_map</code> before this tool.</p>";
        panel.innerHTML = html;
        wirePanel();
        return;
      }

      html += '<ul class="' + NS + '-list">';
      items.forEach(function (t) {
        var url = safeUrl(t.url);
        html += '<li class="' + NS + '-item">';
        html += '<div class="' + NS + '-tName">' + esc(t.name) + "</div>";

        var tags = [];
        if (t.role) tags.push(esc(t.role));
        if (t.modality) tags.push(esc(t.modality));
        if (tags.length) {
          html += '<div class="' + NS + '-tags">';
          tags.forEach(function (x) {
            html += '<span class="' + NS + '-tag">' + x + "</span>";
          });
          html += "</div>";
        }

        if (t.on_demand) {
          html += '<div class="' + NS + '-when"><span class="' + NS
            + '-anytime">Available anytime</span></div>';
        } else {
          var days = (t.sessions || []).map(function (s) {
            var p = parseDay(s.date);
            return p ? { p: p, time: s.time, tz: s.tz } : null;
          }).filter(Boolean);

          if (days.length) {
            // Every date is rendered; the overflow is hidden behind a real
            // toggle rather than a dead "+18 more" label. A volunteer picking
            // a night needs to see the nights.
            var VISIBLE = 6;
            html += '<div class="' + NS + '-when">';
            days.forEach(function (d, i) {
              html += '<span class="' + NS + '-date'
                + (i >= VISIBLE ? " " + NS + "-hid" : "") + '">'
                + "<b>" + esc(d.p.dow) + " " + esc(d.p.label) + "</b>"
                + (d.time ? " · " + esc(d.time)
                  + (d.tz ? " " + esc(d.tz) : "") : "")
                + "</span>";
            });
            if (days.length > VISIBLE) {
              var extra = days.length - VISIBLE;
              html += '<button type="button" class="' + NS + '-more" '
                + 'data-more aria-expanded="false">+' + extra + " more date"
                + (extra === 1 ? "" : "s") + "</button>";
            }
            html += "</div>";
          }
        }

        if (t.venue) {
          html += '<div class="' + NS + '-venue">' + esc(t.venue) + "</div>";
        }
        if (url) {
          html += '<a class="' + NS + '-btn" href="' + esc(url)
            + '" target="_blank" rel="noopener">'
            + (t.on_demand ? "Open the training" : "Registration page")
            + ' <span aria-hidden="true">&rarr;</span></a>';
        }

        if (!isPublic) html += staffBlock(t.staff);
        html += "</li>";
      });
      html += "</ul>";
      panel.innerHTML = html;
      wirePanel();
    }

    function wirePanel() {
      var close = panel.querySelector("." + NS + "-close");
      if (close) {
        close.addEventListener("click", function (e) {
          e.stopPropagation();
          closePanel();
        });
      }
      Array.prototype.forEach.call(
        panel.querySelectorAll("[data-more]"), function (btn) {
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var open = btn.getAttribute("aria-expanded") === "true";
            var wrap = btn.parentNode;
            Array.prototype.forEach.call(
              wrap.querySelectorAll("." + NS + "-date"), function (d, i) {
                if (i >= 6) d.classList.toggle(NS + "-hid", open);
              });
            btn.setAttribute("aria-expanded", open ? "false" : "true");
            btn.textContent = open
              ? "+" + (wrap.querySelectorAll("." + NS + "-date").length - 6)
                + " more dates"
              : "Show fewer dates";
            // The panel just changed height, so re-anchor it.
            if (selected) positionPanel(selected);
          });
        });
    }

    /** Anchor the panel beside the selected state, clamped inside the stage.
     *  Uses real screen rects, so it survives any responsive scaling. */
    function positionPanel(code) {
      panel.style.left = "";
      panel.style.top = "";
      panel.classList.remove(NS + "-sheet");

      // Narrow viewports: a floating bubble is unusable, so dock it.
      if (stage.clientWidth < 680) {
        panel.classList.add(NS + "-sheet");
        return;
      }

      var target = svg.querySelector("." + NS + "-chip[data-state='" + code
        + "']") || paths[code];
      if (!target) return;

      var sr = stage.getBoundingClientRect();
      var tr = target.getBoundingClientRect();
      var pw = panel.offsetWidth;
      var ph = panel.offsetHeight;
      var gap = 14;

      // Place it on whichever side of the state has more room.
      var tCx = tr.left + tr.width / 2 - sr.left;
      var left = (tCx > sr.width / 2)
        ? (tr.left - sr.left) - pw - gap
        : (tr.right - sr.left) + gap;
      left = Math.max(8, Math.min(left, Math.max(8, sr.width - pw - 8)));

      var top = (tr.top + tr.height / 2 - sr.top) - ph / 2;
      top = Math.max(8, Math.min(top, Math.max(8, sr.height - ph - 8)));

      panel.style.left = Math.round(left) + "px";
      panel.style.top = Math.round(top) + "px";
    }

    // --- Events -------------------------------------------------------------

    /** Walk up to the nearest element carrying data-state. */
    function hit(e) {
      var n = e.target;
      while (n && n !== svg) {
        if (n.getAttribute && n.getAttribute("data-state")) {
          return n.getAttribute("data-state");
        }
        n = n.parentNode;
      }
      return null;
    }

    svg.addEventListener("click", function (e) {
      var code = hit(e);
      if (!code) return;
      e.stopPropagation();
      if (code === selected) { closePanel(); return; }
      selectState(code, false);
    });

    svg.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var code = hit(e);
      if (!code) return;
      e.preventDefault();
      selectState(code, true);
    });

    select.addEventListener("change", function () {
      if (!select.value) { closePanel(); return; }
      selectState(select.value, false);
    });

    // The panel has to survive hovering and clicking inside it, so it closes
    // only on an explicit gesture: its button, Escape, or a click outside.
    panel.addEventListener("click", function (e) { e.stopPropagation(); });

    document.addEventListener("click", function (e) {
      if (!selected) return;
      if (mount.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && selected) {
        var t = paths[selected];
        closePanel();
        if (t && t.getAttribute("tabindex") != null) t.focus();
      }
    });

    var rt;
    window.addEventListener("resize", function () {
      if (!selected) return;
      clearTimeout(rt);
      rt = setTimeout(function () { positionPanel(selected); }, 80);
    });

    // ---- deep link -----------------------------------------------------
    // ?state=TX opens that state on load, and selecting a state rewrites the
    // query. This is what makes "here's what Texas has scheduled" a link you
    // can paste to a colleague — who will be asked to sign in, and will then
    // land on the state you meant rather than on the national view.
    // replaceState, not pushState: the panel is a view of this page, not a
    // separate one, and stacking history entries would make Back feel broken.
    function syncUrl(code) {
      if (!window.history || !window.history.replaceState) return;
      var q = code ? "?state=" + encodeURIComponent(code) : "";
      window.history.replaceState(null, "", window.location.pathname + q);
    }

    var initial = /[?&]state=([A-Za-z]{2})\b/.exec(window.location.search);
    if (initial) {
      var code0 = initial[1].toUpperCase();
      if (geo[code0]) selectState(code0, false);
    }

    // Surface a stale data file without failing the page: a map quietly
    // serving last month's sessions is worse than one that says so.
    var asOf = parseDay(meta.as_of_date);
    if (asOf) {
      var ageDays = Math.round((todayLocal() - asOf.date) / 86400000);
      if (ageDays > 3) {
        mount.insertBefore(el("p", NS + "-stale",
          "This schedule was last refreshed " + ageDays
          + " days ago and may be out of date."), stage);
      }
    }
  }
})();
