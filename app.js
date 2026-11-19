const EARTH_KM = 6371;
const MIN_HOME = 0.55;
const MIN_FIT = 0.82;
const MIN_EXTENT = 0.04;

const FRAMES = {
  europe: { center: [15, 54], west: -25, east: 42, south: 34, north: 71 },
  africa: { center: [17, 1.3], west: -18, east: 52, south: -36, north: 38 },
  americas: { center: [-80, 10], west: -128, east: -34, south: -56, north: 72 },
  asia: { center: [88, 32], west: 26, east: 146, south: -11, north: 72 },
};

const LABELS = {
  europe: "Europe",
  africa: "Afrique",
  americas: "Amériques",
  asia: "Asie",
};

const EUROPE = ["ALB", "DEU", "AUT", "BEL", "BLR", "BIH", "BGR", "CYP", "HRV", "DNK", "ESP", "EST", "FIN", "FRA", "GRC", "HUN", "ISL", "IRL", "ITA", "KOS", "LVA", "LTU", "LUX", "MKD", "MDA", "MNE", "NOR", "NLD", "POL", "PRT", "CZE", "ROU", "GBR", "RUS", "SRB", "SVK", "SVN", "SWE", "CHE", "UKR", "TUR"];
const AFRICA = ["DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CMR", "CAF", "TCD", "COG", "COD", "CIV", "EGY", "ERI", "SWZ", "ETH", "GAB", "GHA", "GIN", "GNB", "GNQ", "KEN", "LSO", "LBR", "LBY", "MDG", "MWI", "MLI", "MRT", "MAR", "MOZ", "NAM", "NER", "NGA", "UGA", "RWA", "SEN", "SLE", "SOM", "ZAF", "SDS", "SDN", "TZA", "TGO", "TUN", "ZMB", "ZWE"];
const AMERICAS = ["CAN", "USA", "MEX", "GTM", "HND", "NIC", "CRI", "PAN", "CUB", "HTI", "DOM", "COL", "VEN", "GUY", "SUR", "BRA", "ECU", "PER", "BOL", "PRY", "ARG", "CHL", "URY"];
const ASIA = ["AFG", "SAU", "ARM", "AZE", "BGD", "MMR", "KHM", "CHN", "PRK", "KOR", "ARE", "GEO", "IND", "IDN", "IRN", "IRQ", "JPN", "JOR", "KAZ", "KGZ", "LAO", "MYS", "MNG", "NPL", "OMN", "UZB", "PAK", "PHL", "RUS", "LKA", "SYR", "TJK", "TWN", "THA", "TUR", "TKM", "VNM", "YEM"];
const LISTS = { europe: EUROPE, africa: AFRICA, americas: AMERICAS, asia: ASIA };

const game = {
  modeId: "europe",
  hardMode: false,
  length: 5,
  phase: "intro",
  rounds: [],
  index: 0,
  results: [],
  drag: null,
};

const view = {
  width: 0,
  height: 0,
  projection: null,
  path: null,
  svg: null,
};

const data = {
  countries: [],
  countryById: new Map(),
  lakes: [],
  coastline: null,
  pools: {},
};

const els = {};
let reviewHideTimer = null;
let litReview = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  els.loadText = document.getElementById("load-text");
  els.loadFill = document.getElementById("load-bar-fill");
  els.loadOverlay = document.getElementById("load-overlay");
  els.intro = document.getElementById("intro-modal");
  els.finish = document.getElementById("finish-modal");
  els.chrome = document.getElementById("chrome");
  els.historyWrap = document.getElementById("history-wrap");
  els.history = document.getElementById("history");
  els.kicker = document.getElementById("round-kicker");
  els.prompt = document.getElementById("round-prompt");
  els.target = document.getElementById("target-label");
  els.validate = document.getElementById("btn-validate");
  els.validateFloat = document.getElementById("btn-validate-float");
  els.result = document.getElementById("result");
  els.resultScore = document.getElementById("result-score");
  els.finalScore = document.getElementById("final-score");
  els.recap = document.getElementById("finish-recap");
  els.dock = document.getElementById("piece-dock");
  els.dockSvg = document.getElementById("dock-svg");
  els.dockPath = document.getElementById("dock-path");
  els.dockHint = document.getElementById("dock-hint");
  els.reviewTip = document.getElementById("review-tip");
  els.reviewTipName = document.getElementById("review-tip-name");
  els.reviewTipDetail = document.getElementById("review-tip-detail");
  els.scorePop = document.getElementById("score-pop");
  els.scorePopBody = document.getElementById("score-pop-body");
  els.scoreInfo = document.getElementById("btn-score-info");

  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-replay").addEventListener("click", showHome);
  document.getElementById("btn-next").addEventListener("click", nextRound);
  document.getElementById("btn-map").addEventListener("click", showMyMap);
  document.getElementById("btn-back").addEventListener("click", showScore);
  els.validate.addEventListener("click", validatePlacement);
  els.validateFloat.addEventListener("click", validatePlacement);
  document.querySelector("[data-hard]").addEventListener("change", onHardChange);
  els.scoreInfo.addEventListener("click", toggleScorePop);
  els.dock.addEventListener("pointerdown", onDockPointerDown);
  document.body.addEventListener("click", onControlClick);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeyDown);

  if (!window.d3) {
    els.loadText.textContent = "La carte n'a pas pu se charger.";
    return;
  }

  try {
    await loadData();
    buildIndex();
    buildMap();
    syncControls();
    renderScoreHelp();
    resize();
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    els.loadOverlay.classList.add("is-done");
    els.loadOverlay.setAttribute("aria-busy", "false");
  } catch (error) {
    els.loadText.textContent = "La carte n'a pas pu se charger.";
    console.error(error);
  }
}

async function loadData() {
  const files = [
    ["countries", "data/countries-all-50m.json"],
    ["lakes", "data/lakes-50m.json"],
  ];
  let done = 0;
  const loaded = {};
  await Promise.all(files.map(async ([key, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url);
    loaded[key] = await response.json();
    done += 1;
    const pct = Math.round((done / files.length) * 100);
    els.loadFill.style.width = pct + "%";
    els.loadFill.parentElement.setAttribute("aria-valuenow", String(pct));
  }));
  data.raw = loaded;
}

function buildIndex() {
  const raw = data.raw;
  data.countries = raw.countries.features.filter((feature) => feature.properties.ADM0_A3 !== "ATA");
  data.countryById = new Map(data.countries.map((feature) => [feature.properties.ADM0_A3, feature]));
  mergeInto("CYP", "CYN");
  mergeInto("SOM", "SOL");
  data.lakes = raw.lakes.features.filter((feature) => feature.geometry && Number(feature.properties.scalerank) <= 2);
  data.coastline = buildCoastline();
  data.landlocked = landlockedIds();
  delete data.raw;
  Object.keys(LISTS).forEach((modeId) => poolFor(modeId));
}

function buildMap() {
  const svg = d3.select("#map").append("svg");
  view.svg = svg;
  view.projection = d3.geoOrthographic().clipAngle(90);
  view.path = d3.geoPath(view.projection);
  const defs = svg.append("defs");
  view.seaPattern = defs.append("pattern")
    .attr("id", "sea-texture")
    .attr("patternUnits", "userSpaceOnUse");
  view.seaImage = view.seaPattern.append("image").attr("href", "texture-fond.png");
  const shadow = defs.append("filter")
    .attr("id", "piece-shadow")
    .attr("x", "-20%")
    .attr("y", "-20%")
    .attr("width", "140%")
    .attr("height", "140%");
  shadow.append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 1)
    .attr("stdDeviation", 1.4)
    .attr("flood-color", "#1c1915")
    .attr("flood-opacity", 0.28);
  const globe = defs.append("filter")
    .attr("id", "globe-shadow")
    .attr("x", "-25%")
    .attr("y", "-25%")
    .attr("width", "150%")
    .attr("height", "150%");
  globe.append("feGaussianBlur").attr("stdDeviation", 16);
  const handleDots = defs.append("pattern")
    .attr("id", "handle-dots")
    .attr("width", 4.5)
    .attr("height", 4.5)
    .attr("patternUnits", "userSpaceOnUse");
  handleDots.append("rect").attr("width", 4.5).attr("height", 4.5).attr("fill", "#fff");
  handleDots.append("circle").attr("cx", 2.25).attr("cy", 2.25).attr("r", 1.05).attr("fill", "#c23b33");
  view.globeShadow = svg.append("path").attr("class", "globe-shadow").attr("filter", "url(#globe-shadow)");
  view.sphere = svg.append("path").attr("class", "sphere").attr("fill", "url(#sea-texture)");
  view.graticule = svg.append("path").attr("class", "graticule");
  view.land = svg.append("g");
  view.lakes = svg.append("g");
  view.coastline = svg.append("path").attr("class", "coastline");
  view.truths = svg.append("g").attr("class", "truth-layer");
  view.pieces = svg.append("g").attr("class", "piece-layer");
  view.handle = view.pieces.append("g").attr("class", "piece-handle").attr("display", "none");
  view.handle.append("line").attr("class", "handle-stem");
  view.handle.append("circle").attr("class", "handle-knob");
  view.handle.append("circle").attr("class", "handle-hit");
  view.handle.on("pointerdown", onHandlePointerDown);
  view.arcs = svg.append("g").attr("class", "arc-layer");
  view.graticuleDatum = d3.geoGraticule().step([15, 15]);
}

function resize() {
  stopGlobeSpin();
  const node = document.getElementById("map");
  view.width = node.clientWidth;
  view.height = node.clientHeight;
  view.svg.attr("width", view.width).attr("height", view.height);
  fitSeaTexture();
  fitProjection();
  redraw();
}

const TEXTURE_WIDTH = 1920;
const TEXTURE_HEIGHT = 1080;

function fitSeaTexture() {
  const width = view.width;
  const height = view.height;
  const scale = Math.max(width / TEXTURE_WIDTH, height / TEXTURE_HEIGHT);
  const imageWidth = TEXTURE_WIDTH * scale;
  const imageHeight = TEXTURE_HEIGHT * scale;
  view.seaPattern.attr("width", width).attr("height", height);
  view.seaImage
    .attr("x", (width - imageWidth) / 2)
    .attr("y", (height - imageHeight) / 2)
    .attr("width", imageWidth)
    .attr("height", imageHeight);
}

function activeFrame() {
  const box = FRAMES[game.modeId];
  if (!isCompact()) return box;
  const centers = {
    europe: [18, 52],
    africa: [17, 0],
    americas: [-74, -14],
  };
  const center = centers[game.modeId];
  return center ? { ...box, center } : box;
}

function fitProjection() {
  const box = activeFrame();
  const insets = viewInsets();
  view.projection.rotate([-box.center[0], -box.center[1]]);
  view.projection.scale(frameScale(box, insets)).translate([view.width / 2, insetCenterY(insets)]);
}

function isCompact() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function safeInset(edge) {
  const key = "safe" + edge;
  if (view[key] != null) return view[key];
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-" + edge + ")";
  document.body.append(probe);
  view[key] = probe.offsetHeight || 0;
  probe.remove();
  return view[key];
}

function viewInsets() {
  if (!isCompact()) return { top: 28, right: 28, bottom: 28, left: 28 };
  // The play card covers the top of the screen. The Americas run into it,
  // so that frame alone sits lower and keeps the north of the continent clear.
  const top = game.modeId === "americas" ? 148 + safeInset("top") : 16 + safeInset("top");
  return {
    top,
    right: 12,
    bottom: 16 + safeInset("bottom"),
    left: 12,
  };
}

function insetCenterY(insets) {
  return insets.top + (view.height - insets.top - insets.bottom) / 2;
}

function rectangleSamples(box) {
  const samples = [];
  for (let i = 0; i <= 6; i += 1) {
    for (let j = 0; j <= 4; j += 1) {
      samples.push([
        box.west + ((box.east - box.west) * i) / 6,
        box.south + ((box.north - box.south) * j) / 4,
      ]);
    }
  }
  return samples;
}

function mobileSamples(modeId) {
  if (!data.fitSamples) data.fitSamples = {};
  if (Object.prototype.hasOwnProperty.call(data.fitSamples, modeId)) return data.fitSamples[modeId];
  const points = [];
  const push = (feature, step, accept) => {
    polygonParts(feature).forEach((polygon) => {
      const ring = polygon[0];
      if (!ring) return;
      for (let i = 0; i < ring.length; i += step) {
        if (accept(ring[i])) points.push(ring[i]);
      }
    });
  };
  const ids = LISTS[modeId] || [];
  ids.forEach((id) => {
    const feature = data.countryById.get(id);
    if (!feature) return;
    if (modeId === "europe") {
      push(feature, 5, (point) => point[0] >= -25 && point[0] <= 46 && point[1] >= 34 && point[1] <= 72);
    } else if (modeId === "africa") {
      push(feature, 5, (point) => point[0] >= -19 && point[0] <= 53 && point[1] >= -35.2);
    } else if (modeId === "americas") {
      push(feature, 6, (point) => {
        if (id === "USA") return point[0] <= -66 && point[0] >= -130 && point[1] >= 24 && point[1] <= 50;
        if (id === "CAN") return point[0] >= -132 && point[1] <= 70;
        if (id === "CHL") return point[0] >= -80;
        if (id === "ECU") return point[0] >= -82;
        return point[0] >= -132 && point[0] <= -30;
      });
    } else if (modeId === "asia") {
      push(feature, 6, (point) => point[0] >= 25 && point[0] <= 150 && point[1] >= -12 && point[1] <= 66);
    }
  });
  data.fitSamples[modeId] = points.length ? points : null;
  return data.fitSamples[modeId];
}

function frameScale(box, insets) {
  const outline = game.modeId === "americas" && !isCompact() ? null : mobileSamples(game.modeId);
  const samples = outline || rectangleSamples(box);
  const projection = view.projection;
  const cx = view.width / 2;
  const cy = insetCenterY(insets);
  const fits = (scale) => {
    projection.scale(scale).translate([cx, cy]);
    return samples.every((sample) => {
      const point = projection(sample);
      if (!point) return true;
      return point[0] >= insets.left && point[0] <= view.width - insets.right
        && point[1] >= insets.top && point[1] <= view.height - insets.bottom;
    });
  };
  let lo = 40;
  let hi = 8000;
  if (!fits(lo)) return Math.min(view.width, view.height) * 0.46;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // The fitted Asia frame fills the phone width and leaves the countries small.
  if (isCompact() && game.modeId === "asia") return lo * 1.22;
  return lo;
}

function stopGlobeSpin() {
  if (!view.spin) return;
  view.spin.stop();
  view.spin = null;
}

function angleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function flyToFrame() {
  if (!view.projection || !view.width) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stopGlobeSpin();
    fitProjection();
    redraw();
    return;
  }
  const box = activeFrame();
  const projection = view.projection;
  stopGlobeSpin();
  const fromRotate = projection.rotate();
  const fromScale = projection.scale();
  const targetRotate = [-box.center[0], -box.center[1], 0];
  projection.rotate(targetRotate);
  const insets = viewInsets();
  const targetScale = frameScale(box, insets);
  projection.rotate(fromRotate).scale(fromScale);
  const toLambda = fromRotate[0] + angleDelta(fromRotate[0], targetRotate[0]);
  const toPhi = fromRotate[1] + angleDelta(fromRotate[1], targetRotate[1]);
  const sweep = Math.max(Math.abs(toLambda - fromRotate[0]), Math.abs(toPhi - fromRotate[1]));
  if (sweep < 0.4 && Math.abs(targetScale - fromScale) < 2) {
    fitProjection();
    redraw();
    return;
  }
  const duration = Math.round(Math.min(1800, 720 + sweep * 5.5));
  const started = performance.now();
  view.spin = d3.timer(() => {
    const t = Math.min(1, (performance.now() - started) / duration);
    const eased = d3.easeCubicInOut(t);
    projection.rotate([
      fromRotate[0] + (toLambda - fromRotate[0]) * eased,
      fromRotate[1] + (toPhi - fromRotate[1]) * eased,
      0,
    ]);
    projection.scale(fromScale + (targetScale - fromScale) * eased);
    redraw();
    if (t === 1) stopGlobeSpin();
  });
}

function redraw() {
  if (!view.path) return;
  const path = view.path;
  const sphere = path({ type: "Sphere" });
  view.globeShadow.attr("d", sphere);
  view.sphere.attr("d", sphere);
  view.graticule.attr("d", path(view.graticuleDatum()));
  view.land.selectAll("path")
    .data(data.countries, (feature) => feature.properties.ADM0_A3)
    .join("path")
    .attr("class", "land")
    .attr("d", path);
  view.lakes.selectAll("path")
    .data(data.lakes, (feature, index) => feature.properties.ne_id || index)
    .join("path")
    .attr("class", "lake")
    .attr("fill", "url(#sea-texture)")
    .attr("d", path);
  view.coastline.attr("d", path(data.coastline));
  drawTruths();
  drawPieces();
  drawArcs();
  updateDock();
  if (game.phase !== "review") {
    litReview = null;
    hideReviewTip();
  }
}

function drawPieces() {
  const items = pieceItems();
  const solution = game.phase === "result" || game.phase === "review";
  view.pieces.selectAll("path.piece")
    .data(items, (item) => item.id)
    .join("path")
    .attr("class", "piece")
    .attr("filter", "url(#piece-shadow)")
    .attr("pointer-events", solution ? "none" : null)
    .attr("d", placedPath)
    .on("pointerdown", onPiecePointerDown);
  updateHandle();
  placeValidateFloat();
}

function drawTruths() {
  const items = truthItems();
  view.truths.selectAll("path.truth")
    .data(items, (item) => item.id)
    .join("path")
    .attr("class", (item) => (game.phase === "review" ? "truth truth-review" : "truth"))
    .classed("is-lit", (item) => litReview === item.index)
    .attr("d", (item) => view.path(item.feature))
    .on("pointerenter", showReviewTip)
    .on("pointermove", showReviewTip)
    .on("pointerleave", scheduleHideReview);
}

function drawArcs() {
  const items = arcItems();
  view.arcs.selectAll("path.miss-arc")
    .data(items, (item) => item.id)
    .join("path")
    .attr("class", "miss-arc")
    .attr("d", (item) => view.path(arcLine(item.centroid, item.lonlat)));
}

function pieceItems() {
  if (game.phase === "review") {
    return game.results.filter((result) => result.lonlat).map((result, index) => ({
      id: "piece-" + index,
      feature: result.feature,
      centroid: result.centroid,
      lonlat: result.lonlat,
    }));
  }
  const round = currentRound();
  if (!round || !round.placed) return [];
  if (game.phase !== "play" && game.phase !== "result") return [];
  return [{
    id: "live",
    feature: round.feature,
    centroid: round.centroid,
    lonlat: round.lonlat,
  }];
}

function truthItems() {
  if (game.phase === "result") {
    const round = currentRound();
    const result = game.results[game.results.length - 1];
    if (!round || !result) return [];
    return [{ id: "truth-live", index: game.index, feature: round.feature, result }];
  }
  if (game.phase === "review") {
    return game.results.map((result, index) => ({
      id: "truth-" + index,
      index,
      feature: result.feature,
      result,
    }));
  }
  return [];
}

function arcItems() {
  const source = game.phase === "review"
    ? game.results
    : game.phase === "result"
      ? game.results.slice(-1)
      : [];
  return source.filter((result) => result.lonlat).map((result, index) => ({
    id: "arc-" + index,
    centroid: result.centroid,
    lonlat: result.lonlat,
  }));
}

function placedPath(item) {
  return view.path(placedFeature(item.feature, item.centroid, item.lonlat)) || "";
}

function placedFeature(feature, centroid, lonlat) {
  if (!lonlat || d3.geoDistance(centroid, lonlat) < 1e-8) return feature;
  const rotate = northRotation(centroid, lonlat);
  return {
    type: "Feature",
    properties: feature.properties,
    geometry: {
      type: "MultiPolygon",
      coordinates: polygonParts(feature).map((polygon) => (
        polygon.map((ring) => ring.map(rotate))
      )),
    },
  };
}

function northRotation(from, to) {
  const source = tangentFrame(from);
  const target = tangentFrame(to);
  return (point) => {
    const vector = lonLatToVec(point);
    const east = dot(source.east, vector);
    const north = dot(source.north, vector);
    const radial = dot(source.radial, vector);
    const rotated = [
      target.east[0] * east + target.north[0] * north + target.radial[0] * radial,
      target.east[1] * east + target.north[1] * north + target.radial[1] * radial,
      target.east[2] * east + target.north[2] * north + target.radial[2] * radial,
    ];
    return [
      Math.atan2(rotated[1], rotated[0]) * 180 / Math.PI,
      Math.asin(Math.max(-1, Math.min(1, rotated[2]))) * 180 / Math.PI,
    ];
  };
}

function tangentFrame(point) {
  const lon = point[0] * Math.PI / 180;
  const lat = point[1] * Math.PI / 180;
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const cosLon = Math.cos(lon);
  const sinLon = Math.sin(lon);
  return {
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    radial: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function lonLatToVec(point) {
  const lon = point[0] * Math.PI / 180;
  const lat = point[1] * Math.PI / 180;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

function silhouettePath(feature, centroid) {
  const projection = d3.geoOrthographic()
    .rotate([-centroid[0], -centroid[1]])
    .fitExtent([[12, 8], [156, 100]], feature);
  return d3.geoPath(projection)(feature) || "";
}

function updateDock() {
  const round = currentRound();
  const show = game.phase === "play" && round && !round.placed && !game.drag;
  els.dock.hidden = !show;
  if (!show) return;
  if (!round.silhouette) round.silhouette = silhouettePath(round.feature, round.centroid);
  els.dockSvg.setAttribute("viewBox", "0 0 168 108");
  els.dockPath.setAttribute("d", round.silhouette);
  els.dockHint.classList.remove("is-name");
  els.dockHint.textContent = isCompact() ? "Tenez la poignée." : "Glissez-la sur la carte.";
}

function currentRound() {
  return game.rounds[game.index] || null;
}

function showHome() {
  endDrag();
  game.phase = "intro";
  game.rounds = [];
  game.results = [];
  game.index = 0;
  document.body.className = "is-intro";
  els.finish.hidden = true;
  els.chrome.hidden = true;
  els.historyWrap.hidden = true;
  els.intro.hidden = false;
  els.dock.hidden = true;
  document.getElementById("screen-game").hidden = false;
  document.getElementById("review-bar").hidden = true;
  hideReviewTip();
  syncControls();
  resize();
}

function startGame() {
  endDrag();
  const pool = shuffle(currentPool());
  const count = Math.min(game.length, pool.length);
  game.rounds = pool.slice(0, count).map((entry) => ({
    feature: entry.feature,
    name: entry.name,
    centroid: entry.centroid,
    placed: false,
    lonlat: null,
  }));
  game.index = 0;
  game.results = [];
  game.phase = "play";
  document.body.className = "is-playing";
  els.intro.hidden = true;
  els.finish.hidden = true;
  els.chrome.hidden = false;
  document.getElementById("screen-game").hidden = false;
  document.getElementById("review-bar").hidden = true;
  hideScorePop();
  hideReviewTip();
  renderHistory();
  showRound();
  resize();
}

function showRound() {
  const round = currentRound();
  els.kicker.textContent = "Manche " + (game.index + 1) + " / " + game.rounds.length;
  els.prompt.textContent = "Glissez la pièce";
  els.target.textContent = LABELS[game.modeId];
  els.result.hidden = true;
  els.validate.hidden = false;
  els.validate.disabled = !round || !round.placed;
  updateDock();
}

function validatePlacement() {
  const round = currentRound();
  if (game.phase !== "play" || !round || !round.placed || !round.lonlat) return;
  endDrag();
  const km = Math.round(d3.geoDistance(round.centroid, round.lonlat) * EARTH_KM);
  game.results.push({
    name: round.name,
    feature: round.feature,
    centroid: round.centroid,
    lonlat: round.lonlat,
    km,
  });
  game.phase = "result";
  document.body.className = "is-result";
  showResult();
  renderHistory();
  redraw();
}

function showResult() {
  const result = game.results[game.results.length - 1];
  const round = currentRound();
  els.prompt.textContent = "C'était";
  els.target.textContent = withArticle(round.name);
  els.validate.hidden = true;
  els.result.hidden = false;
  els.resultScore.textContent = formatKm(result.km);
  const next = document.getElementById("btn-next");
  const last = game.index === game.rounds.length - 1;
  next.textContent = last ? "Voir mon total" : "Manche suivante";
  updateDock();
}

function nextRound() {
  if (game.phase !== "result") return;
  if (game.index === game.rounds.length - 1) {
    finishGame();
    return;
  }
  game.index += 1;
  game.phase = "play";
  document.body.className = "is-playing";
  showRound();
  renderHistory();
  redraw();
}

function finishGame() {
  endDrag();
  game.phase = "finish";
  document.body.className = "is-finish";
  els.intro.hidden = true;
  els.chrome.hidden = true;
  els.historyWrap.hidden = true;
  els.dock.hidden = true;
  hideReviewTip();
  renderRecap();
  els.finish.hidden = false;
  redraw();
}

function showMyMap() {
  game.phase = "review";
  document.body.className = "is-review";
  els.finish.hidden = true;
  els.chrome.hidden = false;
  els.dock.hidden = true;
  document.getElementById("screen-game").hidden = true;
  document.getElementById("review-bar").hidden = false;
  renderHistory();
  redraw();
}

function showScore() {
  game.phase = "finish";
  document.body.className = "is-finish";
  els.finish.hidden = false;
  els.chrome.hidden = true;
  els.historyWrap.hidden = true;
  els.dock.hidden = true;
  document.getElementById("screen-game").hidden = false;
  document.getElementById("review-bar").hidden = true;
  hideReviewTip();
  redraw();
}

function renderHistory() {
  const playing = game.phase === "play" || game.phase === "result" || game.phase === "review";
  els.historyWrap.hidden = !playing || game.results.length === 0;
  document.body.classList.toggle("has-history", playing && game.results.length > 0);
  const total = totalKm();
  const items = game.results.map((result) => (
    "<li><span>" + escapeHtml(result.name) + "</span><span class=\"score-num\">" + formatKm(result.km) + "</span></li>"
  ));
  if (game.results.length) {
    items.push("<li class=\"score-history-total\"><span>Total</span><span class=\"score-num\">" + formatKm(total) + "</span></li>");
  }
  els.history.innerHTML = items.join("");
}

function renderRecap() {
  els.finalScore.textContent = formatKm(totalKm());
  els.recap.innerHTML = game.results.map((result) => (
    "<li><p class=\"finish-recap-name\">" + escapeHtml(result.name) + "</p>"
    + "<p class=\"finish-recap-score\">" + formatKm(result.km) + "</p></li>"
  )).join("");
}

function totalKm() {
  return game.results.reduce((sum, result) => sum + result.km, 0);
}

const HANDLE_STEM = 62;
const HANDLE_RADIUS = 16;

function onDockPointerDown(event) {
  if (game.phase !== "play" || event.button > 0) return;
  if (isCompact() && !event.target.closest(".dock-handle")) return;
  const round = currentRound();
  if (!round) return;
  event.preventDefault();
  beginDrag(event, [0, isCompact() ? HANDLE_STEM + HANDLE_RADIUS + 48 : 0], true);
}

function onHandlePointerDown(event) {
  if (!isCompact() || game.phase !== "play" || event.button > 0) return;
  const round = currentRound();
  if (!round || !round.placed) return;
  event.preventDefault();
  event.stopPropagation();
  const screen = pointerInMap(event);
  const placed = view.projection(round.lonlat);
  if (!placed) return;
  beginDrag(event, [screen[0] - placed[0], screen[1] - placed[1]], false);
}

function onPiecePointerDown(event, item) {
  if (game.phase !== "play" || item.id !== "live" || event.button > 0) return;
  event.preventDefault();
  event.stopPropagation();
  const screen = pointerInMap(event);
  const placed = view.projection(item.lonlat);
  if (!placed) return;
  beginDrag(event, [screen[0] - placed[0], screen[1] - placed[1]], false);
}

function beginDrag(event, grab, fromDock) {
  endDrag();
  const screen = pointerInMap(event);
  game.drag = {
    pointerId: event.pointerId,
    grab,
    fromDock,
    moved: false,
    origin: screen,
  };
  document.body.classList.add("is-dragging");
  placeValidateFloat();
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(event) {
  const drag = game.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const screen = pointerInMap(event);
  if (!drag.moved && Math.hypot(screen[0] - drag.origin[0], screen[1] - drag.origin[1]) >= 6) {
    drag.moved = true;
    if (drag.fromDock) els.dock.hidden = true;
  }
  if ((!drag.fromDock || drag.moved) && movePiece(screen)) drag.tracked = true;
}

function onPointerUp(event) {
  const drag = game.drag;
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
  const round = currentRound();
  if (event) {
    const screen = pointerInMap(event);
    if (Math.hypot(screen[0] - drag.origin[0], screen[1] - drag.origin[1]) >= 6) {
      drag.moved = true;
      if (drag.fromDock) els.dock.hidden = true;
      // A thumb rolls upward as it leaves the glass, so the release point
      // sits a few pixels above the last place the piece was held.
      if (!drag.tracked) movePiece(screen);
    }
  }
  if (round && drag.fromDock && !drag.moved) clearPlacement(round);
  else if (round && round.placed && centroidOverDock(round)) clearPlacement(round);
  endDrag();
  if (round && game.phase === "play") {
    els.validate.disabled = !round.placed;
    updateDock();
    drawPieces();
  }
}

function endDrag() {
  if (!game.drag) return;
  game.drag = null;
  document.body.classList.remove("is-dragging");
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
}

function movePiece(screen) {
  if (!commitPiece(screen)) return false;
  if (isCompact()) fitHandleLift(screen);
  updateHandle();
  return true;
}

function commitPiece(screen) {
  const round = currentRound();
  const drag = game.drag;
  if (!round || !drag) return false;
  const target = [screen[0] - drag.grab[0], screen[1] - drag.grab[1]];
  const lonlat = view.projection.invert(target);
  if (!lonlat || !Number.isFinite(lonlat[0]) || !Number.isFinite(lonlat[1])) return false;
  const back = view.projection(lonlat);
  if (!back || Math.hypot(back[0] - target[0], back[1] - target[1]) > 12) return false;
  const d = view.path(placedFeature(round.feature, round.centroid, lonlat));
  if (!d) return false;
  round.lonlat = lonlat;
  round.placed = true;
  els.validate.disabled = false;
  const path = view.pieces.select("path.piece");
  if (path.empty()) drawPieces();
  else path.attr("d", d);
  return true;
}

function fitHandleLift(screen) {
  const drag = game.drag;
  const round = currentRound();
  const node = view.pieces.select("path.piece").node();
  const center = round && view.projection(round.lonlat);
  if (!drag || !node || !center) return;
  const box = node.getBBox();
  const lift = box.y + box.height - center[1] + HANDLE_STEM + HANDLE_RADIUS;
  if (Math.abs(drag.grab[1] - lift) <= 1.5) return;
  drag.grab[1] = lift;
  commitPiece(screen);
}

function updateHandle() {
  const handle = view.handle;
  if (!handle) return;
  const round = currentRound();
  const show = isCompact() && game.phase === "play" && round && round.placed;
  if (!show) {
    handle.attr("display", "none");
    return;
  }
  const center = view.projection(round.lonlat);
  const node = view.pieces.select("path.piece").node();
  if (!center || !node) {
    handle.attr("display", "none");
    return;
  }
  const box = node.getBBox();
  const x = center[0];
  const knobY = box.y + box.height + HANDLE_STEM + HANDLE_RADIUS;
  handle.attr("display", null);
  handle.select(".handle-stem")
    .attr("x1", x)
    .attr("y1", box.y + box.height + 2)
    .attr("x2", x)
    .attr("y2", knobY - HANDLE_RADIUS);
  handle.select(".handle-knob")
    .attr("cx", x)
    .attr("cy", knobY)
    .attr("r", HANDLE_RADIUS);
  handle.select(".handle-hit")
    .attr("cx", x)
    .attr("cy", knobY)
    .attr("r", 28);
  handle.raise();
}

function placeValidateFloat() {
  const button = els.validateFloat;
  if (!button) return;
  const round = currentRound();
  const node = view.pieces && view.pieces.select("path.piece").node();
  const show = game.phase === "play" && round && round.placed && !game.drag && node;
  if (!show) {
    button.hidden = true;
    return;
  }
  const box = node.getBBox();
  const x = box.x + box.width / 2;
  button.hidden = false;
  const width = button.offsetWidth || 72;
  const height = button.offsetHeight || 26;
  const gap = 14;
  let belowTop = box.y + box.height;
  if (isCompact() && view.handle && view.handle.attr("display") !== "none") {
    const cy = Number(view.handle.select(".handle-knob").attr("cy"));
    const radius = Number(view.handle.select(".handle-knob").attr("r")) || HANDLE_RADIUS;
    if (Number.isFinite(cy)) belowTop = Math.max(belowTop, cy + radius);
  }
  const above = [x, box.y - gap - height / 2];
  const below = [x, belowTop + gap + height / 2];
  const mapRect = view.svg.node().getBoundingClientRect();
  const blocked = (point) => {
    const left = mapRect.left + point[0] - width / 2;
    const top = mapRect.top + point[1] - height / 2;
    const rect = { left, top, right: left + width, bottom: top + height };
    if (rect.left < 8 || rect.top < 8 || rect.right > window.innerWidth - 8 || rect.bottom > window.innerHeight - 8) return true;
    return [els.chrome, els.historyWrap, els.dock].some((panel) => {
      if (!panel || panel.hidden) return false;
      const bounds = panel.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return false;
      return rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
    });
  };
  const room = (point) => Math.min(
    point[0] - width / 2,
    view.width - point[0] - width / 2,
    point[1] - height / 2,
    view.height - point[1] - height / 2,
  );
  const spot = [above, below].sort((a, b) => {
    const overlap = Number(blocked(a)) - Number(blocked(b));
    if (overlap) return overlap;
    return room(b) - room(a);
  })[0];
  button.style.left = (mapRect.left + spot[0]) + "px";
  button.style.top = (mapRect.top + spot[1]) + "px";
}

function clearPlacement(round) {
  round.placed = false;
  round.lonlat = null;
  els.validate.disabled = true;
}

function centroidOverDock(round) {
  if (els.dock.hidden) return false;
  const placed = view.projection(round.lonlat);
  if (!placed) return false;
  const mapRect = view.svg.node().getBoundingClientRect();
  const dockRect = els.dock.getBoundingClientRect();
  const x = placed[0] + mapRect.left;
  const y = placed[1] + mapRect.top;
  return x >= dockRect.left && x <= dockRect.right && y >= dockRect.top && y <= dockRect.bottom;
}

function pointerInMap(event) {
  const rect = view.svg.node().getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}

function showReviewTip(event, item) {
  clearTimeout(reviewHideTimer);
  litReview = item.index;
  view.truths.selectAll("path.truth").classed("is-lit", (mark) => mark.index === litReview);
  const result = item.result;
  els.reviewTipName.textContent = result.name;
  els.reviewTipDetail.textContent = formatKm(result.km);
  els.reviewTip.classList.remove("is-good");
  els.reviewTip.hidden = false;
  const pad = 10;
  const gap = 14;
  const width = els.reviewTip.offsetWidth;
  const height = els.reviewTip.offsetHeight;
  let x = event.clientX - width / 2;
  let y = event.clientY - height - gap;
  const below = y < pad;
  if (below) y = event.clientY + gap;
  if (x < pad) x = pad;
  if (x + width > window.innerWidth - pad) x = window.innerWidth - pad - width;
  const tipX = Math.min(width - 14, Math.max(14, event.clientX - x));
  els.reviewTip.classList.toggle("is-below", below);
  els.reviewTip.style.left = x + "px";
  els.reviewTip.style.top = y + "px";
  els.reviewTip.style.setProperty("--tip-x", tipX + "px");
}

function scheduleHideReview() {
  clearTimeout(reviewHideTimer);
  reviewHideTimer = setTimeout(() => {
    litReview = null;
    if (view.truths) view.truths.selectAll("path.truth").classed("is-lit", false);
    hideReviewTip();
  }, 60);
}

function hideReviewTip() {
  if (els.reviewTip) els.reviewTip.hidden = true;
}

function currentPool() {
  const pool = poolFor(game.modeId);
  if (!game.hardMode || game.modeId === "americas") return pool;
  return pool.filter((entry) => data.landlocked.has(entry.feature.properties.ADM0_A3));
}

function poolFor(modeId) {
  if (data.pools[modeId]) return data.pools[modeId];
  const box = FRAMES[modeId];
  const shorter = frameShorterKm(box);
  const pool = [];
  LISTS[modeId].forEach((id) => {
    const source = data.countryById.get(id);
    if (!source) return;
    const feature = keptFeature(source, box);
    if (!feature) return;
    const home = planarArea(feature) / planarArea(source);
    if (home < MIN_HOME) return;
    const fitted = clipFeature(feature, box);
    const fit = fitted ? planarArea(fitted) / planarArea(feature) : 0;
    if (fit < MIN_FIT) return;
    const extent = extentKm(feature);
    if (extent / shorter < MIN_EXTENT) return;
    const centroid = d3.geoCentroid(feature);
    pool.push({
      feature,
      name: displayName(feature),
      centroid,
    });
  });
  data.pools[modeId] = pool;
  return pool;
}

function keptFeature(feature, box) {
  const polygons = [];
  polygonParts(feature).forEach((polygon) => {
    if (polygon.some(crossesAntimeridian)) return;
    const center = ringCentroid(polygon[0]);
    if (!center || !insideBox(center, box, 0.4)) return;
    polygons.push(polygon);
  });
  if (!polygons.length) return null;
  return {
    type: "Feature",
    properties: feature.properties,
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
}

function clipFeature(feature, box) {
  const polygons = [];
  polygonParts(feature).forEach((polygon) => {
    if (polygon.some(crossesAntimeridian)) return;
    const outer = clipRing(polygon[0], box);
    if (!outer) return;
    const holes = [];
    for (let i = 1; i < polygon.length; i += 1) {
      const hole = clipRing(polygon[i], box);
      if (hole) holes.push(hole);
    }
    polygons.push([outer, ...holes]);
  });
  if (!polygons.length) return null;
  return {
    type: "Feature",
    properties: feature.properties,
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
}

function clipRing(ring, box) {
  const edges = [
    [(point) => point[0] >= box.west, (a, b) => intersect(a, b, box.west, "x")],
    [(point) => point[0] <= box.east, (a, b) => intersect(a, b, box.east, "x")],
    [(point) => point[1] >= box.south, (a, b) => intersect(a, b, box.south, "y")],
    [(point) => point[1] <= box.north, (a, b) => intersect(a, b, box.north, "y")],
  ];
  let output = ring.slice(0, -1);
  for (let edge = 0; edge < edges.length; edge += 1) {
    const insideEdge = edges[edge][0];
    const hit = edges[edge][1];
    const input = output;
    output = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentIn = insideEdge(current);
      const previousIn = insideEdge(previous);
      if (currentIn) {
        if (!previousIn) output.push(hit(previous, current));
        output.push(current);
      } else if (previousIn) output.push(hit(previous, current));
    }
  }
  if (output.length < 3) return null;
  output.push(output[0].slice());
  return output;
}

function intersect(a, b, value, axis) {
  if (axis === "x") {
    const t = (value - a[0]) / ((b[0] - a[0]) || 1e-12);
    return [value, a[1] + (b[1] - a[1]) * t];
  }
  const t = (value - a[1]) / ((b[1] - a[1]) || 1e-12);
  return [a[0] + (b[0] - a[0]) * t, value];
}

function frameShorterKm(box) {
  const midLat = (box.south + box.north) / 2;
  const width = kmBetween([box.west, midLat], [box.east, midLat]);
  const height = kmBetween([box.center[0], box.south], [box.center[0], box.north]);
  return Math.min(width, height);
}

function extentKm(feature) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  polygonParts(feature).forEach((polygon) => {
    polygon[0].forEach((point) => {
      west = Math.min(west, point[0]);
      east = Math.max(east, point[0]);
      south = Math.min(south, point[1]);
      north = Math.max(north, point[1]);
    });
  });
  const midLat = (south + north) / 2;
  return Math.max(kmBetween([west, midLat], [east, midLat]), kmBetween([0, south], [0, north]));
}

function planarArea(feature) {
  return polygonParts(feature).reduce((sum, polygon) => {
    let area = Math.abs(ringArea(polygon[0]));
    for (let i = 1; i < polygon.length; i += 1) area -= Math.abs(ringArea(polygon[i]));
    return sum + Math.max(0, area);
  }, 0);
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += (x2 - x1) * (y2 + y1);
  }
  return area / 2;
}

function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-9) return ring[Math.floor(ring.length / 2)];
  return [x / (3 * area), y / (3 * area)];
}

function insideBox(point, box, margin) {
  return point[0] >= box.west - margin && point[0] <= box.east + margin
    && point[1] >= box.south - margin && point[1] <= box.north + margin;
}

function crossesAntimeridian(ring) {
  for (let i = 0; i < ring.length - 1; i += 1) {
    if (Math.abs(ring[i + 1][0] - ring[i][0]) > 180) return true;
  }
  return false;
}

function kmBetween(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function mergeInto(id, extraId) {
  const primary = data.countryById.get(id);
  const extra = data.countryById.get(extraId);
  if (!primary || !extra) return;
  data.countryById.set(id, {
    type: "Feature",
    properties: primary.properties,
    geometry: {
      type: "MultiPolygon",
      coordinates: polygonParts(primary).concat(polygonParts(extra)),
    },
  });
}

function polygonParts(feature) {
  const geometry = feature && feature.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function buildCoastline() {
  const counts = new Map();
  const lines = new Map();
  data.countries.forEach((feature) => {
    polygonParts(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const start = ring[i];
          const end = ring[i + 1];
          const key = edgeKey(start, end);
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!lines.has(key)) lines.set(key, [start, end]);
        }
      });
    });
  });
  const coordinates = [];
  lines.forEach((line, key) => {
    if (counts.get(key) === 1) coordinates.push(line);
  });
  return { type: "MultiLineString", coordinates };
}

function edgeKey(start, end) {
  const a = pointKey(start);
  const b = pointKey(end);
  if (a === b) return null;
  return a < b ? a + "|" + b : b + "|" + a;
}

function pointKey(point) {
  return Math.round(point[0] * 1000) + "," + Math.round(point[1] * 1000);
}

function landlockedIds() {
  const counts = new Map();
  const owner = new Map();
  const midpoint = new Map();
  data.countries.forEach((feature) => {
    const id = feature.properties.ADM0_A3;
    polygonParts(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const start = ring[i];
          const end = ring[i + 1];
          const key = edgeKey(start, end);
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!owner.has(key)) {
            owner.set(key, id);
            midpoint.set(key, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]);
          }
        }
      });
    });
  });
  const ocean = new Set();
  counts.forEach((count, key) => {
    if (count !== 1) return;
    const point = midpoint.get(key);
    if (isCaspian(point) || isAral(point)) return;
    ocean.add(owner.get(key));
  });
  return new Set(data.countries
    .map((feature) => feature.properties.ADM0_A3)
    .filter((id) => !ocean.has(id)));
}

function isCaspian(point) {
  return point[0] >= 46.5 && point[0] <= 55.2 && point[1] >= 36.4 && point[1] <= 47.3;
}

function isAral(point) {
  return point[0] >= 57.8 && point[0] <= 62.2 && point[1] >= 43.2 && point[1] <= 47.2;
}

function displayName(feature) {
  const props = feature.properties;
  const name = props.NAME_FR || props.NAME;
  if (name === "République populaire de Chine") return "Chine";
  return name;
}

const ARTICLE = {
  Afghanistan: "l'",
  "Afrique du Sud": "l'",
  Albanie: "l'",
  Algérie: "l'",
  Allemagne: "l'",
  Angola: "l'",
  "Arabie saoudite": "l'",
  Argentine: "l'",
  Arménie: "l'",
  Autriche: "l'",
  Azerbaïdjan: "l'",
  Égypte: "l'",
  Équateur: "l'",
  Érythrée: "l'",
  Espagne: "l'",
  Estonie: "l'",
  Eswatini: "l'",
  Éthiopie: "l'",
  Inde: "l'",
  Indonésie: "l'",
  Irak: "l'",
  Iran: "l'",
  Irlande: "l'",
  Islande: "l'",
  Italie: "l'",
  Ouganda: "l'",
  Ouzbékistan: "l'",
  Ukraine: "l'",
  Uruguay: "l'",
  "Émirats arabes unis": "les ",
  "États-Unis": "les ",
  "Pays-Bas": "les ",
  Philippines: "les ",
  Belgique: "la ",
  Biélorussie: "la ",
  Birmanie: "la ",
  Bolivie: "la ",
  "Bosnie-Herzégovine": "la ",
  Bulgarie: "la ",
  Chine: "la ",
  Colombie: "la ",
  "Corée du Nord": "la ",
  "Corée du Sud": "la ",
  "Côte d'Ivoire": "la ",
  Croatie: "la ",
  Finlande: "la ",
  France: "la ",
  Géorgie: "la ",
  Grèce: "la ",
  Guinée: "la ",
  "Guinée équatoriale": "la ",
  "Guinée-Bissau": "la ",
  Hongrie: "la ",
  Jordanie: "la ",
  Lettonie: "la ",
  Libye: "la ",
  Lituanie: "la ",
  "Macédoine du Nord": "la ",
  Malaisie: "la ",
  Mauritanie: "la ",
  Moldavie: "la ",
  Mongolie: "la ",
  Namibie: "la ",
  Norvège: "la ",
  Pologne: "la ",
  "République centrafricaine": "la ",
  "République démocratique du Congo": "la ",
  "République dominicaine": "la ",
  "République du Congo": "la ",
  Roumanie: "la ",
  Russie: "la ",
  Serbie: "la ",
  "Sierra Leone": "la ",
  Slovaquie: "la ",
  Slovénie: "la ",
  Somalie: "la ",
  Suède: "la ",
  Suisse: "la ",
  Syrie: "la ",
  Tanzanie: "la ",
  Tchéquie: "la ",
  Thaïlande: "la ",
  Tunisie: "la ",
  Turquie: "la ",
  Zambie: "la ",
};

const NO_ARTICLE = new Set([
  "Chypre",
  "Chypre du Nord",
  "Cuba",
  "Haïti",
  "Madagascar",
  "Oman",
  "Sri Lanka",
  "Taïwan",
]);

function withArticle(name) {
  if (NO_ARTICLE.has(name)) return name;
  const article = ARTICLE[name] || "le ";
  return article + name;
}

function syncControls() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.mode === game.modeId ? "true" : "false");
  });
  document.querySelectorAll("[data-length]").forEach((button) => {
    button.setAttribute("aria-pressed", Number(button.dataset.length) === game.length ? "true" : "false");
  });
  const americas = game.modeId === "americas";
  if (americas) game.hardMode = false;
  document.querySelectorAll("[data-hard]").forEach((input) => {
    input.checked = game.hardMode;
    input.disabled = americas;
  });
  const hint = americas
    ? "Indisponible ici : il ne resterait que deux pays."
    : "Pays enclavés seulement.";
  document.querySelectorAll(".hard-hint").forEach((node) => {
    node.textContent = hint;
  });
}

function onHardChange(event) {
  if (game.modeId === "americas") {
    game.hardMode = false;
    syncControls();
    return;
  }
  game.hardMode = event.target.checked;
  syncControls();
}

function onControlClick(event) {
  const modeButton = event.target.closest("[data-mode]");
  if (modeButton && game.phase === "intro") {
    if (modeButton.dataset.mode === game.modeId) return;
    game.modeId = modeButton.dataset.mode;
    if (game.modeId === "americas") game.hardMode = false;
    syncControls();
    flyToFrame();
    return;
  }
  const lengthButton = event.target.closest("[data-length]");
  if (lengthButton && game.phase === "intro") {
    game.length = Number(lengthButton.dataset.length);
    syncControls();
  }
}

function onDocumentClick(event) {
  if (!els.scorePop || els.scorePop.hidden) return;
  if (event.target.closest("#score-pop") || event.target.closest("#btn-score-info")) return;
  hideScorePop();
}

function onKeyDown(event) {
  if (event.key === "Escape") hideScorePop();
  if (event.key === "Enter" && game.phase === "play") validatePlacement();
}

function renderScoreHelp() {
  if (!els.scorePopBody) return;
  const intro = document.createElement("p");
  intro.className = "score-pop-intro";
  intro.textContent = "Chaque manche donne l'écart, en kilomètres, entre le centre de votre pièce et le vrai centre du pays.";
  const note = document.createElement("p");
  note.className = "score-pop-note";
  note.textContent = game.hardMode
    ? "Le total additionne ces écarts. Le but est de le rendre le plus petit possible. Le mode difficile enlève les îles et les pays côtiers. La Caspienne et la mer d'Aral restent."
    : "Le total additionne ces écarts. Le but est de le rendre le plus petit possible.";
  const credit = document.createElement("p");
  credit.className = "score-pop-credit";
  credit.textContent = "Fond de carte Natural Earth";
  els.scorePopBody.replaceChildren(intro, note, credit);
}

function toggleScorePop(event) {
  event.stopPropagation();
  if (els.scorePop.hidden) {
    renderScoreHelp();
    els.scorePop.hidden = false;
    els.scoreInfo.setAttribute("aria-expanded", "true");
    return;
  }
  hideScorePop();
}

function hideScorePop() {
  if (!els.scorePop) return;
  els.scorePop.hidden = true;
  if (els.scoreInfo) els.scoreInfo.setAttribute("aria-expanded", "false");
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function arcLine(start, end) {
  const interpolate = d3.geoInterpolate(start, end);
  const steps = Math.max(2, Math.ceil(d3.geoDistance(start, end) * EARTH_KM / 80));
  const coordinates = [];
  for (let i = 0; i <= steps; i += 1) coordinates.push(interpolate(i / steps));
  return { type: "LineString", coordinates };
}

function formatKm(km) {
  return formatNumber(km) + " km";
}

function formatNumber(value) {
  return value.toLocaleString("fr-FR");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
