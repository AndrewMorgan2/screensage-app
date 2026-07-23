/* Plain ES5 + XMLHttpRequest, same constraints as app.js - Kindle's browser has no fetch(). */

function xhrJSON(method, url, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        cb(null, JSON.parse(xhr.responseText));
      } else {
        cb(new Error("request failed: " + xhr.status), null);
      }
    }
  };
  xhr.send(null);
}

function renderStatus(characters) {
  var list = document.getElementById("statusList");
  list.innerHTML = "";

  if (characters.length === 0) {
    list.innerHTML = "No characters found on the server.";
    return;
  }

  for (var i = 0; i < characters.length; i++) {
    var c = characters[i];
    var card = document.createElement("a");
    card.className = "statusCard";
    card.href = "/kindle?char=" + encodeURIComponent(c.id);

    var hpLabel = "-- / --";
    var hpClass = "hpOk";
    if (c.hp) {
      hpLabel = c.hp.current + " / " + c.hp.max;
      if (c.hp.max > 0 && c.hp.current <= 0) {
        hpClass = "hpDown";
      } else if (c.hp.max > 0 && c.hp.current <= c.hp.max / 2) {
        hpClass = "hpHurt";
      }
    }

    card.innerHTML =
      '<span class="statusName">' + c.name + "</span>" +
      '<span class="statusSub">' + c.class + " - Level " + c.level + "</span>" +
      '<span class="statusHP ' + hpClass + '">HP ' + hpLabel + "</span>";

    list.appendChild(card);
  }
}

function loadStatus(silent) {
  var list = document.getElementById("statusList");
  if (!silent) {
    list.innerHTML = "Loading...";
  }
  xhrJSON("GET", "/api/kindle/characters", function (err, data) {
    if (err) {
      if (!silent) {
        list.innerHTML = "Failed to load party status (check connection)";
      }
      return;
    }
    renderStatus(data);
  });
}

// Listens for HP/ability/enabled-state changes broadcast from the server
// (see kindle_handlers.rs) so this page updates without a manual reload.
// Reconnects on drop, same pattern as static/js/draw.js.
function setupRefreshListener() {
  var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  var ws = new WebSocket(protocol + "//" + window.location.host + "/ws");

  ws.onmessage = function (event) {
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (data.type === "kindle_refresh") {
      loadStatus(true);
    }
  };

  ws.onclose = function () {
    setTimeout(setupRefreshListener, 2000);
  };
}

window.onload = function () {
  loadStatus();
  setupRefreshListener();
};
