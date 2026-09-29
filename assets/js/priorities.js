/**
 * Daily priorities planner.
 *
 * Ranks a short daily task list against the situation you are actually in, and
 * explains every position. Data is cached locally and synchronized through the
 * portfolio backend to its Supabase database.
 */
(function () {
  "use strict";

  var root = document.querySelector(".priorities-tool");
  if (!root) return;

  var STORAGE_KEY = "jth_priority_planner_v1";
  var OWNER_KEY = "jth_priority_planner_owner_v1";
  var API_BASE = "https://chatbot-backend-zto2.onrender.com/api/schedule";
  var TOP_LIMIT = 10;
  var DAILY_MIN = 5;
  var DAILY_MAX = 8;
  var LIFE_CAREER_TARGET = 0.8;
  var BALANCE_WINDOW = 20;
  var DAY_MS = 86400000;

  var AREAS = { life_career: "Life & career", exploration: "Exploration" };
  var ENERGY = { low: { label: "Low", rank: 1 }, steady: { label: "Steady", rank: 2 }, high: { label: "High", rank: 3 } };
  var WEIGHTS = { urgency: 0.3, impact: 0.28, fit: 0.18, readiness: 0.14, balance: 0.1 };
  var DEFAULT_SITUATION = { label: "Regular day", minutesAvailable: 180, energy: "steady", focus: "mixed" };

  var state = { tasks: [], situation: null };
  var editingId = null;
  var ownerId = getOwnerId();
  var syncTimer = null;
  var remoteReady = false;
  var changedBeforeRemoteLoad = false;

  /* ---------------------------------------------------------------- scoring */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function daysUntilDue(dueAt, now) {
    if (!dueAt) return null;
    var due = new Date(dueAt).getTime();
    if (isNaN(due)) return null;
    return (due - now) / DAY_MS;
  }

  function urgencyScore(task, now) {
    var days = daysUntilDue(task.dueAt, now);
    if (days === null) return 0.35;
    if (days <= 0) return 1;
    if (days <= 1) return 0.92;
    return clamp(0.92 - (days - 1) / 14, 0.1, 0.92);
  }

  function impactScore(task) {
    return clamp((Number(task.impact) - 1) / 4, 0, 1);
  }

  function fitScore(task, situation) {
    var available = Number(situation.minutesAvailable);
    var effort = Math.max(5, Number(task.effortMinutes) || 0);
    if (!available || available <= 0) return 0.2;
    var ratio = effort / available;
    if (ratio <= 1) return clamp(1 - ratio * 0.2, 0.8, 1);
    return clamp(1 / (ratio * ratio), 0.05, 0.8);
  }

  function readinessScore(task, situation) {
    var required = (ENERGY[task.energy] || ENERGY.steady).rank;
    var current = (ENERGY[situation.energy] || ENERGY.steady).rank;
    var score = current >= required ? 1 : 1 - 0.3 * (required - current);
    if (situation.focus === "deep") score += required === 3 ? 0.12 : -0.06;
    if (situation.focus === "light") score += required === 1 ? 0.12 : -0.1;
    return clamp(score, 0.05, 1);
  }

  function lifeCareerShare(tasks) {
    var done = tasks
      .filter(function (task) {
        return task.completedAt;
      })
      .sort(function (a, b) {
        return new Date(b.completedAt) - new Date(a.completedAt);
      })
      .slice(0, BALANCE_WINDOW);
    if (!done.length) return null;
    var career = done.filter(function (task) {
      return task.area === "life_career";
    }).length;
    return career / done.length;
  }

  function balanceScore(task, share) {
    var current = share === null ? LIFE_CAREER_TARGET : share;
    var lean = clamp(0.5 + (LIFE_CAREER_TARGET - current) * 1.5, 0, 1);
    return task.area === "life_career" ? lean : 1 - lean;
  }

  function reasonsFor(task, factors, situation, now) {
    var reasons = [];
    var days = daysUntilDue(task.dueAt, now);
    if (days !== null && days <= 0) reasons.push("Overdue \u2014 clear it first");
    else if (days !== null && days <= 1) reasons.push("Due within a day");
    else if (days !== null && days <= 3) reasons.push("Due in " + Math.ceil(days) + " days");
    else if (days === null) reasons.push("No deadline set");

    if (factors.impact >= 0.75) reasons.push("High impact on what matters");
    else if (factors.impact <= 0.25) reasons.push("Low stated impact");

    if (factors.fit >= 0.8) reasons.push("Fits your " + situation.minutesAvailable + " min window");
    else reasons.push("Needs " + task.effortMinutes + " min \u2014 longer than today allows");

    if (factors.readiness >= 0.9) {
      reasons.push("Matches " + (ENERGY[situation.energy] || ENERGY.steady).label.toLowerCase() + " energy");
    } else if (factors.readiness <= 0.6) {
      reasons.push("Demands more energy than you have");
    }

    if (factors.balance >= 0.65) {
      reasons.push(task.area === "life_career" ? "Pulls you back toward the 80% life & career target" : "Exploration is under its 20% share");
    }
    return reasons;
  }

  function rankTasks(tasks, situation, now) {
    var share = lifeCareerShare(tasks);
    return tasks
      .filter(function (task) {
        return !task.completedAt;
      })
      .map(function (task) {
        var factors = {
          urgency: urgencyScore(task, now),
          impact: impactScore(task),
          fit: fitScore(task, situation),
          readiness: readinessScore(task, situation),
          balance: balanceScore(task, share),
        };
        var score = 0;
        for (var key in WEIGHTS) {
          if (Object.prototype.hasOwnProperty.call(WEIGHTS, key)) score += factors[key] * WEIGHTS[key];
        }
        return { task: task, score: score, factors: factors, reasons: reasonsFor(task, factors, situation, now) };
      })
      .sort(function (a, b) {
        return b.score - a.score || new Date(a.task.createdAt || 0) - new Date(b.task.createdAt || 0);
      })
      .slice(0, TOP_LIMIT)
      .map(function (entry, index) {
        entry.rank = index + 1;
        return entry;
      });
  }

  /* -------------------------------------------------------------- storage */

  function showAlert(message) {
    var box = document.getElementById("pri-alert");
    box.textContent = message;
    box.hidden = !message;
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { tasks: [], situation: cloneSituation(DEFAULT_SITUATION) };
      var parsed = JSON.parse(raw);
      var situation = cloneSituation(DEFAULT_SITUATION);
      if (parsed.situation) {
        for (var key in situation) {
          if (parsed.situation[key] !== undefined) situation[key] = parsed.situation[key];
        }
      }
      return { tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [], situation: situation };
    } catch (err) {
      return { tasks: [], situation: cloneSituation(DEFAULT_SITUATION) };
    }
  }

  function getOwnerId() {
    try {
      var existing = window.localStorage.getItem(OWNER_KEY);
      if (existing) return existing;
      var created = newId();
      window.localStorage.setItem(OWNER_KEY, created);
      return created;
    } catch (err) {
      return newId();
    }
  }

  function saveLocal() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showAlert("This browser blocked local storage, so today\u2019s plan is not saved.");
    }
  }

  function syncRemote() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(function () {
      fetch(API_BASE + "/" + encodeURIComponent(ownerId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: state }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error("sync failed");
          showAlert("");
        })
        .catch(function () {
          showAlert("Your changes are saved on this device. Cloud sync will retry with your next change.");
        });
    }, 450);
  }

  function save() {
    saveLocal();
    if (!remoteReady) changedBeforeRemoteLoad = true;
    syncRemote();
  }

  function applyState(nextState) {
    var situation = cloneSituation(DEFAULT_SITUATION);
    if (nextState && nextState.situation) {
      for (var key in situation) {
        if (nextState.situation[key] !== undefined) situation[key] = nextState.situation[key];
      }
    }
    state = { tasks: nextState && Array.isArray(nextState.tasks) ? nextState.tasks : [], situation: situation };
    dayInput.value = state.situation.label;
    minutesInput.value = state.situation.minutesAvailable;
    energyInput.value = state.situation.energy;
    focusInput.value = state.situation.focus;
    saveLocal();
    render();
  }

  function loadRemote() {
    fetch(API_BASE + "/" + encodeURIComponent(ownerId))
      .then(function (response) {
        if (!response.ok) throw new Error("load failed");
        return response.json();
      })
      .then(function (payload) {
        remoteReady = true;
        if (payload.state && !changedBeforeRemoteLoad) {
          applyState(payload.state);
        } else {
          syncRemote();
        }
      })
      .catch(function () {
        remoteReady = true;
        showAlert("Using this device's saved plan. Cloud sync is temporarily unavailable.");
      });
  }

  function cloneSituation(source) {
    return { label: source.label, minutesAvailable: source.minutesAvailable, energy: source.energy, focus: source.focus };
  }

  function newId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "task-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  /* -------------------------------------------------------------- rendering */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function button(label, className, onClick) {
    var node = el("button", "pri-btn " + className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function renderStats(ranked) {
    var open = state.tasks.filter(function (task) {
      return !task.completedAt;
    });
    var planned = ranked.reduce(function (total, entry) {
      return total + Number(entry.task.effortMinutes || 0);
    }, 0);
    var share = lifeCareerShare(state.tasks);

    var note =
      open.length < DAILY_MIN
        ? "Add " + (DAILY_MIN - open.length) + " more to reach a full day."
        : open.length > DAILY_MAX
          ? "More than eight open items \u2014 consider deferring a few."
          : "Good size for one day.";

    var stats = document.getElementById("pri-stats");
    stats.textContent = "";
    [
      [String(open.length), "open tasks \u00b7 " + note],
      [planned + " min", "planned in the top " + ranked.length + " vs " + state.situation.minutesAvailable + " min available"],
      [
        share === null ? "\u2014" : Math.round(share * 100) + "%",
        "life & career share of your last " + BALANCE_WINDOW + " completions \u00b7 target 80%",
      ],
    ].forEach(function (pair) {
      var box = el("div");
      box.appendChild(el("strong", null, pair[0]));
      box.appendChild(el("span", null, pair[1]));
      stats.appendChild(box);
    });
  }

  function renderRanking(ranked) {
    var list = document.getElementById("pri-ranking");
    list.textContent = "";
    document.getElementById("pri-ranking-empty").hidden = ranked.length > 0;

    ranked.forEach(function (entry) {
      var row = el("li", "pri-row");

      var rank = el("span", "pri-rank", String(entry.rank));
      rank.setAttribute("aria-hidden", "true");
      row.appendChild(rank);

      var body = el("div", "pri-body");
      var heading = el("h3");
      heading.appendChild(el("span", "sr-only", "Priority " + entry.rank + ": "));
      heading.appendChild(document.createTextNode(entry.task.title));
      body.appendChild(heading);

      var reasons = el("ul", "pri-reasons");
      entry.reasons.forEach(function (reason) {
        reasons.appendChild(el("li", null, reason));
      });
      body.appendChild(reasons);
      row.appendChild(body);

      var actions = el("div", "pri-actions");
      var score = el("span", "pri-score", entry.score.toFixed(2));
      score.title = "Weighted priority score";
      actions.appendChild(score);
      actions.appendChild(
        button("Complete", "pri-secondary", function () {
          toggleComplete(entry.task.id);
        })
      );
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  function renderEditor(task, container) {
    var form = el("form", "pri-body");
    var title = el("input");
    title.type = "text";
    title.value = task.title;
    title.required = true;
    title.setAttribute("aria-label", "Task");

    var area = el("select");
    area.setAttribute("aria-label", "Area");
    Object.keys(AREAS).forEach(function (key) {
      var option = el("option", null, AREAS[key]);
      option.value = key;
      if (task.area === key) option.selected = true;
      area.appendChild(option);
    });

    var impact = el("input");
    impact.type = "number";
    impact.min = "1";
    impact.max = "5";
    impact.value = task.impact;
    impact.setAttribute("aria-label", "Impact");

    var effort = el("input");
    effort.type = "number";
    effort.min = "5";
    effort.step = "5";
    effort.value = task.effortMinutes;
    effort.setAttribute("aria-label", "Effort in minutes");

    var grid = el("div", "pri-grid");
    [
      ["Task", title],
      ["Area", area],
      ["Impact (1\u20135)", impact],
      ["Effort (minutes)", effort],
    ].forEach(function (pair) {
      var label = el("label", null, pair[0]);
      label.appendChild(pair[1]);
      grid.appendChild(label);
    });
    form.appendChild(grid);

    var actions = el("div", "pri-actions");
    var submit = el("button", "pri-btn", "Save task");
    submit.type = "submit";
    actions.appendChild(submit);
    actions.appendChild(
      button("Cancel", "pri-secondary", function () {
        editingId = null;
        render();
      })
    );
    form.appendChild(actions);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!title.value.trim()) return;
      task.title = title.value.trim();
      task.area = area.value;
      task.impact = Number(impact.value);
      task.effortMinutes = Number(effort.value);
      editingId = null;
      save();
      render();
    });

    container.appendChild(form);
  }

  function renderAll() {
    var wrap = document.getElementById("pri-all");
    wrap.textContent = "";

    if (!state.tasks.length) {
      var empty = el("div", "pri-empty");
      empty.appendChild(el("strong", null, "No tasks captured yet"));
      empty.appendChild(el("span", null, "Your plan will sync automatically after you add the first task."));
      wrap.appendChild(empty);
      return;
    }

    var list = el("div", "pri-list");
    state.tasks.forEach(function (task) {
      var row = el("li", "pri-row" + (task.completedAt ? " pri-done" : ""));
      row.style.listStyle = "none";

      if (editingId === task.id) {
        renderEditor(task, row);
        list.appendChild(row);
        return;
      }

      var body = el("div", "pri-body");
      body.appendChild(el("h3", null, task.title));
      if (task.notes) body.appendChild(el("div", "pri-meta", task.notes));
      row.appendChild(body);

      var actions = el("div", "pri-actions");
      actions.appendChild(
        button(task.completedAt ? "Reopen" : "Complete", "pri-secondary", function () {
          toggleComplete(task.id);
        })
      );
      actions.appendChild(
        button("Edit", "pri-secondary", function () {
          editingId = task.id;
          render();
        })
      );
      actions.appendChild(
        button("Delete", "pri-quiet", function () {
          state.tasks = state.tasks.filter(function (item) {
            return item.id !== task.id;
          });
          save();
          render();
        })
      );
      row.appendChild(actions);
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  function render() {
    var ranked = rankTasks(state.tasks, state.situation, Date.now());
    renderStats(ranked);
    renderRanking(ranked);
    renderAll();
  }

  function toggleComplete(id) {
    state.tasks.forEach(function (task) {
      if (task.id !== id) return;
      task.completedAt = task.completedAt ? null : new Date().toISOString();
    });
    save();
    render();
  }

  /* ----------------------------------------------------------------- wiring */

  var dayInput = document.getElementById("pri-day");
  var minutesInput = document.getElementById("pri-minutes");
  var energyInput = document.getElementById("pri-energy");
  var focusInput = document.getElementById("pri-focus");

  state = load();
  dayInput.value = state.situation.label;
  minutesInput.value = state.situation.minutesAvailable;
  energyInput.value = state.situation.energy;
  focusInput.value = state.situation.focus;

  function bindSituation(input, key, asNumber) {
    input.addEventListener("input", function () {
      state.situation[key] = asNumber ? Number(input.value) : input.value;
      save();
      render();
    });
  }

  bindSituation(dayInput, "label", false);
  bindSituation(minutesInput, "minutesAvailable", true);
  bindSituation(energyInput, "energy", false);
  bindSituation(focusInput, "focus", false);

  document.getElementById("pri-rerank").addEventListener("click", render);

  document.getElementById("pri-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var title = document.getElementById("pri-title");
    if (!title.value.trim()) return;
    state.tasks.push({
      id: newId(),
      title: title.value.trim(),
      area: document.getElementById("pri-area").value,
      impact: Number(document.getElementById("pri-impact").value),
      effortMinutes: Number(document.getElementById("pri-effort").value),
      energy: document.getElementById("pri-task-energy").value,
      dueAt: document.getElementById("pri-due").value || null,
      notes: document.getElementById("pri-notes").value.trim(),
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    event.target.reset();
    document.getElementById("pri-impact").value = 3;
    document.getElementById("pri-effort").value = 30;
    save();
    render();
  });

  render();
  loadRemote();
})();
