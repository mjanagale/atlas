// Paste the deployed Apps Script web app URL here after completing the setup guide.
// Never put API keys or other secrets in this file — it is downloaded by every visitor.
const TRACKING_API_URL = "https://script.google.com/macros/s/AKfycbwTy9KQA395lMVRIArf4fyTVMz5pCBpUqZlU98tOoAIJaMyTBtd_d-LKEH75UfqcjXElQ/exec";
const TRACKING_TIMEOUT_MS = 15000;
const WHATSAPP_NUMBER = "8619550534114";
const REFERENCE_PATTERN = /^[A-Z0-9-]{4,40}$/;

// Shipment stages shown in the progress bar, in order. Each sheet status is matched
// to a stage by keyword, so "In transit" or "Departed port" still count as "Shipped".
const STAGES = [
  { label: "Request received", keywords: ["request", "order received"] },
  { label: "Sourcing", keywords: ["sourcing", "purchas", "procure", "ordered", "supplier"] },
  { label: "Cargo received", keywords: ["cargo received", "warehouse", "collected", "goods received"] },
  { label: "Consolidating", keywords: ["consolidat", "prepar", "packing", "loading"] },
  { label: "Shipped", keywords: ["shipped", "transit", "departed", "on the way", "sailing", "dispatched", "arrived"] },
  { label: "Delivered", keywords: ["delivered", "completed", "complete", "picked up"] }
];
const ATTENTION_KEYWORDS = ["hold", "delay", "issue", "problem", "cancel", "customs check"];

const SVG_NS = "http://www.w3.org/2000/svg";

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#icon-${name}`);
  svg.append(use);
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function whatsappLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// ---- Header & navigation ----

const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector("#site-nav");

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 24);
}
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

function setMenu(open) {
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  siteNav.classList.toggle("is-open", open);
}

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && siteNav.classList.contains("is-open")) {
      setMenu(false);
      menuToggle.focus();
    }
  });
}

// ---- Shipment tracking ----

const trackingForm = document.querySelector("#tracking-form");
const trackingInput = document.querySelector("#tracking-reference");
const trackingSubmit = document.querySelector("#tracking-submit");
const trackingResult = document.querySelector("#tracking-result");
const quickTrackForm = document.querySelector("#quick-track-form");
const quickTrackInput = document.querySelector("#quick-track-reference");
// Only one lookup at a time, so a slow earlier response can never replace a newer one.
let trackingInFlight = false;

function normalizeReference(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function setLoading(isLoading) {
  if (!trackingSubmit) return;
  trackingSubmit.disabled = isLoading;
  trackingSubmit.classList.toggle("is-loading", isLoading);
  trackingSubmit.querySelector(".button-label").textContent = isLoading ? "Checking…" : "Track shipment";
  trackingResult?.setAttribute("aria-busy", String(isLoading));
}

function showResult(...nodes) {
  trackingResult.replaceChildren(...nodes);
  trackingResult.hidden = false;
}

function showSkeleton() {
  const skeleton = el("div", "result-skeleton");
  skeleton.append(el("span"), el("span"), el("span"));
  showResult(skeleton);
}

function showAlert(message, { tone = "error", reference } = {}) {
  const alert = el("div", `result-alert is-${tone}`);
  const body = el("p");
  body.append(message);
  const helpText = reference
    ? `Hello ATLAS, I need an update on shipment ${reference}.`
    : "Hello ATLAS, I need an update on my shipment.";
  const link = el("a", "", "Ask us on WhatsApp");
  link.href = whatsappLink(helpText);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  body.append(" ", link, ".");
  alert.append(icon(tone === "error" ? "search" : "phone"), body);
  showResult(alert);
}

function findStage(status) {
  const value = status.toLowerCase();
  if (ATTENTION_KEYWORDS.some((keyword) => value.includes(keyword))) return { index: -1, attention: true };
  // Search from the last stage backwards so "Cargo received" wins over "Request received".
  for (let index = STAGES.length - 1; index >= 0; index -= 1) {
    if (STAGES[index].keywords.some((keyword) => value.includes(keyword))) return { index, attention: false };
  }
  return { index: -1, attention: false };
}

function buildProgress(stageIndex) {
  const list = el("ol", "progress");
  const isComplete = stageIndex === STAGES.length - 1;
  list.classList.toggle("is-complete", isComplete);
  list.style.setProperty("--progress", String(stageIndex / (STAGES.length - 1)));
  list.setAttribute("aria-label", `Step ${stageIndex + 1} of ${STAGES.length}: ${STAGES[stageIndex].label}`);

  STAGES.forEach((stage, index) => {
    const item = el("li");
    const dot = el("span", "progress-dot");
    if (index < stageIndex || (isComplete && index === stageIndex)) {
      dot.append(icon("check"));
    }
    if (index < stageIndex) item.className = "is-done";
    if (index === stageIndex) {
      item.className = "is-current";
      item.setAttribute("aria-current", "step");
    }
    item.append(dot, stage.label);
    list.append(item);
  });
  return list;
}

function showShipment(reference, shipment) {
  const status = shipment.status || "Status pending";
  const stage = findStage(status);

  const card = el("article", "shipment");
  card.setAttribute("aria-label", `Shipment ${reference}`);

  const head = el("div", "shipment-head");
  const ref = el("div", "shipment-ref");
  ref.append(el("small", "", "Reference"), el("strong", "", reference));
  let badgeTone = "is-active";
  if (stage.attention) badgeTone = "is-warn";
  else if (stage.index === STAGES.length - 1) badgeTone = "is-success";
  const badge = el("span", `status-badge ${badgeTone}`, status);
  head.append(ref, badge);

  const body = el("div", "shipment-body");
  if (stage.index >= 0) body.append(buildProgress(stage.index));
  body.append(
    el("p", "shipment-update", "Latest update"),
    el("p", "shipment-message", shipment.update || "No additional details have been added yet. Contact ATLAS if you need more information about this shipment.")
  );

  const foot = el("div", "shipment-foot");
  foot.append(el("span", "", shipment.updated ? `Last updated: ${shipment.updated}` : "Last updated: not recorded"));
  const ask = el("a");
  ask.href = whatsappLink(`Hello ATLAS, I have a question about shipment ${reference} (status: ${status}).`);
  ask.target = "_blank";
  ask.rel = "noopener noreferrer";
  ask.append(icon("whatsapp"), "Ask about this shipment");
  foot.append(ask);
  body.append(foot);

  card.append(head, body);
  showResult(card);
}

// Fetched without cookies (credentials: "omit"). If the browser sent the visitor's
// Google cookies, someone signed in to several Google accounts would be redirected
// to /macros/u/1/s/..., which returns 404. Apps Script allows any origin (CORS *),
// so the JSONP-style response `atlasTrackingCallback({...});` is read as text and parsed.
async function requestShipment(reference) {
  let requestUrl;
  try {
    requestUrl = new URL(TRACKING_API_URL);
  } catch (error) {
    throw Object.assign(new Error("Invalid tracking endpoint URL."), { code: "not_configured" });
  }
  requestUrl.searchParams.set("reference", reference);
  requestUrl.searchParams.set("callback", "atlasTrackingCallback");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TRACKING_TIMEOUT_MS);
  let text;
  try {
    const response = await fetch(requestUrl, {
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Tracking service responded with HTTP ${response.status}.`);
    text = await response.text();
  } catch (error) {
    const code = error.name === "AbortError" ? "timeout" : "network";
    throw Object.assign(new Error(error.message), { code });
  } finally {
    window.clearTimeout(timeoutId);
  }

  const match = text.match(/^\s*atlasTrackingCallback\(([\s\S]*)\);?\s*$/);
  try {
    return JSON.parse(match ? match[1] : text);
  } catch (error) {
    throw Object.assign(new Error("Unexpected response from the tracking service."), { code: "network" });
  }
}

const ERROR_MESSAGES = {
  not_found: "We couldn't find a shipment with that reference. Check it carefully and try again.",
  invalid_reference: "That doesn't look like a valid tracking reference. Use letters, numbers and hyphens only.",
  timeout: "Tracking is taking longer than expected. Please try again in a moment.",
  network: "We couldn't connect to the tracking service. Check your internet connection and try again.",
  not_configured: "Online tracking is temporarily unavailable."
};

async function trackShipment(rawReference) {
  const reference = normalizeReference(rawReference);
  trackingInput.value = reference;

  if (!REFERENCE_PATTERN.test(reference)) {
    trackingInput.setAttribute("aria-invalid", "true");
    showAlert(ERROR_MESSAGES.invalid_reference, { tone: "error" });
    trackingInput.focus();
    return;
  }
  trackingInput.removeAttribute("aria-invalid");

  if (!TRACKING_API_URL) {
    showAlert(ERROR_MESSAGES.not_configured, { tone: "warn", reference });
    return;
  }

  if (trackingInFlight) return;
  trackingInFlight = true;
  setLoading(true);
  showSkeleton();

  try {
    const response = await requestShipment(reference);

    if (response && response.ok === true && response.shipment && typeof response.shipment.status === "string") {
      showShipment(reference, response.shipment);
      return;
    }

    const code = response && response.code;
    if (code === "not_found" || code === "invalid_reference") {
      showAlert(ERROR_MESSAGES[code], { tone: "error", reference });
    } else {
      // Configuration problems on the Apps Script side (see docs/GOOGLE_SHEETS_TRACKING_SETUP.md).
      console.error(`Shipment lookup failed with code "${code || "unknown"}". See the tracking setup guide's troubleshooting section.`);
      showAlert("We couldn't retrieve the tracking update right now.", { tone: "warn", reference });
    }
  } catch (error) {
    console.error(error);
    showAlert(ERROR_MESSAGES[error.code] || ERROR_MESSAGES.network, { tone: "warn", reference });
  } finally {
    trackingInFlight = false;
    setLoading(false);
  }
}

if (trackingForm && trackingInput && trackingResult) {
  trackingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    trackShipment(trackingInput.value);
  });

  trackingInput.addEventListener("input", () => trackingInput.removeAttribute("aria-invalid"));

  if (quickTrackForm && quickTrackInput) {
    quickTrackForm.addEventListener("submit", (event) => {
      event.preventDefault();
      document.querySelector(".tracking-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      trackShipment(quickTrackInput.value);
    });
  }

  // Support links like https://example.com/?ref=AT-7K4P9X#tracking so ATLAS can send
  // customers a direct tracking link.
  const params = new URLSearchParams(window.location.search);
  const linkedReference = params.get("ref") || params.get("reference");
  if (linkedReference) {
    document.querySelector("#tracking")?.scrollIntoView({ block: "start" });
    trackShipment(linkedReference);
  }
}

const year = document.querySelector("#current-year");
if (year) {
  year.textContent = String(new Date().getFullYear());
}
