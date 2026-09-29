---
layout: page
permalink: /priorities/
title: priorities
description: A personal daily planner that re-ranks what matters as your day changes.
nav: true
nav_order: 9
---

<div class="priorities-tool">
  <p class="pri-intro">
    Capture the five to eight things you actually intend to do today. The top ten
    re-order themselves whenever your situation changes, and every position explains
    itself. Everything stays in this browser &mdash; nothing is uploaded.
  </p>

  <div id="pri-alert" class="pri-alert" role="alert" hidden></div>

  <section class="pri-card" aria-labelledby="pri-situation-heading">
    <h2 id="pri-situation-heading">Today&rsquo;s situation</h2>
    <p class="pri-help">Change any of these and the ranking recalculates immediately.</p>
    <div class="pri-grid">
      <label for="pri-day">What kind of day is it?
        <input id="pri-day" type="text" />
      </label>
      <label for="pri-minutes">Time available (minutes)
        <input id="pri-minutes" type="number" min="15" step="15" />
      </label>
      <label for="pri-energy">Energy right now
        <select id="pri-energy">
          <option value="low">Low</option>
          <option value="steady">Steady</option>
          <option value="high">High</option>
        </select>
      </label>
      <label for="pri-focus">Focus available
        <select id="pri-focus">
          <option value="light">Light &mdash; short, shallow blocks</option>
          <option value="mixed">Mixed &mdash; a normal day</option>
          <option value="deep">Deep &mdash; protected focus time</option>
        </select>
      </label>
    </div>
    <div class="pri-stats" id="pri-stats"></div>
  </section>

  <section aria-labelledby="pri-ranking-heading">
    <div class="pri-section-head">
      <h2 id="pri-ranking-heading">Top ten right now</h2>
      <button type="button" class="pri-btn pri-quiet" id="pri-rerank">Re-rank</button>
    </div>
    <ol class="pri-list" id="pri-ranking" aria-labelledby="pri-ranking-heading"></ol>
    <div class="pri-empty" id="pri-ranking-empty" hidden>
      <strong>Nothing ranked yet</strong>
      <span>Add today&rsquo;s tasks below and they will be sequenced for you.</span>
    </div>
  </section>

  <section class="pri-card" aria-labelledby="pri-add-heading">
    <h2 id="pri-add-heading">Add a task</h2>
    <form id="pri-form">
      <label for="pri-title">Task
        <input id="pri-title" type="text" required placeholder="e.g. Draft the internship application" />
      </label>
      <div class="pri-grid">
        <label for="pri-area">Area
          <select id="pri-area">
            <option value="life_career">Life &amp; career</option>
            <option value="exploration">Exploration</option>
          </select>
        </label>
        <label for="pri-impact">Impact (1&ndash;5)
          <input id="pri-impact" type="number" min="1" max="5" value="3" />
        </label>
        <label for="pri-effort">Effort (minutes)
          <input id="pri-effort" type="number" min="5" step="5" value="30" />
        </label>
        <label for="pri-task-energy">Energy needed
          <select id="pri-task-energy">
            <option value="low">Low</option>
            <option value="steady" selected>Steady</option>
            <option value="high">High</option>
          </select>
        </label>
        <label for="pri-due">Due (optional)
          <input id="pri-due" type="datetime-local" />
        </label>
      </div>
      <label for="pri-notes">Notes (optional)
        <textarea id="pri-notes" rows="2"></textarea>
      </label>
      <button type="submit" class="pri-btn">Add task</button>
    </form>
  </section>

  <section aria-labelledby="pri-all-heading">
    <h2 id="pri-all-heading">All tasks</h2>
    <div id="pri-all"></div>
  </section>
</div>

<link rel="stylesheet" href="{{ '/assets/css/priorities.css' | relative_url }}" />
<script src="{{ '/assets/js/priorities.js' | relative_url }}"></script>
