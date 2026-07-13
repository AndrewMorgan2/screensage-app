/* Plain ES5 + XMLHttpRequest on purpose - the Kindle's built-in browser is an
   old WebKit build with no fetch(), no arrow functions, no let/const. */

var currentCharacter = null;
var selectedChar = null;
var expandedAbilities = {};

function getCharParam() {
  var search = window.location.search;
  if (search.charAt(0) === "?") {
    search = search.substring(1);
  }
  var parts = search.split("&");
  for (var i = 0; i < parts.length; i++) {
    var kv = parts[i].split("=");
    if (kv[0] === "char" && kv[1]) {
      return decodeURIComponent(kv[1]);
    }
  }
  return null;
}

function apiUrl(path) {
  return path + "?char=" + encodeURIComponent(selectedChar);
}

function xhrJSON(method, url, body, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        cb(null, JSON.parse(xhr.responseText));
      } else {
        cb(new Error("request failed: " + xhr.status), null);
      }
    }
  };
  xhr.send(body ? JSON.stringify(body) : null);
}

function loadCharacter() {
  xhrJSON("GET", apiUrl("/api/kindle/character"), null, function (err, data) {
    if (err) {
      document.getElementById("charName").innerHTML = "Failed to load (check connection)";
      return;
    }
    currentCharacter = data;
    render();
  });
}

function renderStatRow(containerId, dataObj) {
  var container = document.getElementById(containerId);
  container.innerHTML = "";
  if (!dataObj) {
    return;
  }
  for (var key in dataObj) {
    if (!dataObj.hasOwnProperty(key)) {
      continue;
    }
    var cell = document.createElement("div");
    cell.className = "statCell";
    cell.innerHTML =
      '<span class="statLabel">' + key + "</span>" +
      '<span class="statValue">' + dataObj[key] + "</span>";
    container.appendChild(cell);
  }
}

function render() {
  document.getElementById("charName").innerHTML = currentCharacter.name;
  var sub = currentCharacter.class + " - Level " + currentCharacter.level;
  if (currentCharacter.alignment) {
    sub += " - " + currentCharacter.alignment;
  }
  document.getElementById("charSub").innerHTML = sub;
  document.getElementById("hpValue").innerHTML =
    currentCharacter.hp.current + " / " + currentCharacter.hp.max;

  renderStatRow("statsGrid", currentCharacter.stats);
  renderStatRow("combatGrid", currentCharacter.combat);

  renderAbilities();
}

function renderAbilities() {
  var grid = document.getElementById("abilityGrid");
  grid.innerHTML = "";

  for (var i = 0; i < currentCharacter.abilities.length; i++) {
    var ability = currentCharacter.abilities[i];
    var isExpanded = !!expandedAbilities[ability.id];
    var isDepleted = ability.uses && ability.uses.current === 0;

    var usesLabel = "";
    if (ability.uses) {
      usesLabel = " (" + ability.uses.current + "/" + ability.uses.max + ")";
    }

    var headerClass = "abilityHeader" + (isDepleted ? " depleted" : "");
    var arrow = isExpanded ? "▾" : "▸";

    var bodyHtml = "";
    if (isExpanded) {
      bodyHtml = '<div class="abilityBody"><div class="abDesc">' + ability.description + "</div>";
      if (ability.uses) {
        bodyHtml += '<div class="abUses">Uses remaining: ' + ability.uses.current + " / " + ability.uses.max + "</div>";
        bodyHtml += '<div class="abActions">';
        if (ability.uses.current > 0) {
          bodyHtml += '<button class="useBtn" data-id="' + ability.id + '">Use</button>';
        }
        bodyHtml += '<button class="resetBtn" data-id="' + ability.id + '">Reset</button>';
        bodyHtml += "</div>";
      }
      bodyHtml += "</div>";
    }

    var item = document.createElement("div");
    item.className = "abilityItem";
    item.innerHTML =
      '<button class="' + headerClass + '" data-id="' + ability.id + '">' +
      '<span class="abName">' + ability.name + usesLabel + "</span>" +
      '<span class="abType">' + ability.type + "</span>" +
      '<span class="abArrow">' + arrow + "</span>" +
      "</button>" +
      bodyHtml;

    grid.appendChild(item);
  }

  var headers = grid.getElementsByClassName("abilityHeader");
  for (var h = 0; h < headers.length; h++) {
    headers[h].onclick = makeToggleHandler(headers[h].getAttribute("data-id"));
  }

  var useBtns = grid.getElementsByClassName("useBtn");
  for (var u = 0; u < useBtns.length; u++) {
    useBtns[u].onclick = makeUseHandler(useBtns[u].getAttribute("data-id"));
  }

  var resetBtns = grid.getElementsByClassName("resetBtn");
  for (var r = 0; r < resetBtns.length; r++) {
    resetBtns[r].onclick = makeResetHandler(resetBtns[r].getAttribute("data-id"));
  }
}

function makeToggleHandler(id) {
  return function () {
    expandedAbilities[id] = !expandedAbilities[id];
    renderAbilities();
  };
}

function makeUseHandler(id) {
  return function (e) {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    useAbility(id);
  };
}

function makeResetHandler(id) {
  return function (e) {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    resetAbility(id);
  };
}

function useAbility(id) {
  xhrJSON("POST", apiUrl("/api/kindle/ability/" + id + "/use"), {}, function (err, data) {
    if (!err) {
      currentCharacter = data;
      document.getElementById("hpValue").innerHTML =
        currentCharacter.hp.current + " / " + currentCharacter.hp.max;
      renderAbilities();
    }
  });
}

function resetAbility(id) {
  xhrJSON("POST", apiUrl("/api/kindle/ability/" + id + "/reset"), {}, function (err, data) {
    if (!err) {
      currentCharacter = data;
      renderAbilities();
    }
  });
}

function adjustHP(delta) {
  xhrJSON("POST", apiUrl("/api/kindle/hp"), { delta: delta }, function (err, data) {
    if (!err) {
      currentCharacter = data;
      render();
    }
  });
}

function loadCharacterList() {
  xhrJSON("GET", "/api/kindle/characters", null, function (err, data) {
    var list = document.getElementById("pickerList");
    if (err) {
      list.innerHTML = "Failed to load character list (check connection)";
      return;
    }
    if (data.length === 0) {
      list.innerHTML = "No characters found on the server.";
      return;
    }
    list.innerHTML = "";
    for (var i = 0; i < data.length; i++) {
      var c = data[i];
      var btn = document.createElement("button");
      btn.className = "pickerBtn";
      btn.innerHTML =
        '<span class="pickerName">' + c.name + "</span>" +
        '<span class="pickerSub">' + c.class + " - Level " + c.level + "</span>";
      btn.onclick = makeCharSelectHandler(c.id);
      list.appendChild(btn);
    }
  });
}

function makeCharSelectHandler(id) {
  return function () {
    window.location.href = "/kindle?char=" + encodeURIComponent(id);
  };
}

function goFullscreen() {
  var el = document.documentElement;
  var request = el.requestFullscreen || el.webkitRequestFullscreen ||
    el.webkitRequestFullScreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (request) {
    try {
      request.call(el);
      return;
    } catch (e) {
      // fall through to alert below
    }
  }
  alert("Fullscreen not supported by this browser");
}

window.onload = function () {
  selectedChar = getCharParam();

  if (!selectedChar) {
    document.getElementById("picker").style.display = "block";
    document.getElementById("sheet").style.display = "none";
    loadCharacterList();
    return;
  }

  document.getElementById("picker").style.display = "none";
  document.getElementById("sheet").style.display = "block";

  document.getElementById("hpMinus").onclick = function () { adjustHP(-1); };
  document.getElementById("hpPlus").onclick = function () { adjustHP(1); };
  document.getElementById("fullscreenBtn").onclick = goFullscreen;
  loadCharacter();

  // Old-WebKit trick: scrolling past the top after load collapses some
  // mobile browser chrome that has no Fullscreen API support.
  setTimeout(function () { window.scrollTo(0, 1); }, 300);
};
