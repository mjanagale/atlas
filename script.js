const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector("#site-nav");

// Paste the deployed Apps Script web app URL here after completing the setup guide.
const TRACKING_API_URL = "https://script.google.com/macros/s/AKfycbwTy9KQA395lMVRIArf4fyTVMz5pCBpUqZlU98tOoAIJaMyTBtd_d-LKEH75UfqcjXElQ/exec";

if (menuToggle && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isExpanded));
    menuToggle.setAttribute("aria-label", isExpanded ? "Open navigation" : "Close navigation");
    siteNav.classList.toggle("is-open", !isExpanded);
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
      siteNav.classList.remove("is-open");
    }
  });
}

const trackingForm = document.querySelector("#tracking-form");
const trackingInput = document.querySelector("#tracking-reference");
const trackingResult = document.querySelector("#tracking-result");
let trackingRequestId = 0;

function showTrackingMessage(message, isError = false) {
  if (!trackingResult) return;
  trackingResult.replaceChildren();
  trackingResult.classList.toggle("is-error", isError);
  trackingResult.textContent = message;
  trackingResult.hidden = false;
}

function showTrackingRecord(record) {
  if (!trackingResult) return;

  const heading = document.createElement("strong");
  heading.className = "tracking-result-status";
  heading.textContent = record.status;

  const details = document.createElement("p");
  details.textContent = record.update || "Contact ATLAS if you need more information about this shipment.";

  const updated = document.createElement("small");
  updated.textContent = record.updated ? `Last updated: ${record.updated}` : "";

  trackingResult.replaceChildren(heading, details, updated);
  trackingResult.classList.remove("is-error");
  trackingResult.hidden = false;
}

if (trackingForm && trackingInput && trackingResult) {
  trackingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const reference = trackingInput.value.trim().toUpperCase();

    if (!/^[A-Z0-9-]{4,40}$/.test(reference)) {
      showTrackingMessage("Enter a valid tracking reference using letters, numbers and hyphens.", true);
      trackingInput.focus();
      return;
    }

    if (!TRACKING_API_URL) {
      showTrackingMessage("Online tracking is not connected yet. Please contact ATLAS on WhatsApp for an update.", true);
      return;
    }

    trackingResult.hidden = true;
    trackingResult.replaceChildren();
    const requestId = ++trackingRequestId;
    let completed = false;
    let requestUrl;
    try {
      requestUrl = new URL(TRACKING_API_URL);
    } catch (error) {
      console.error("The shipment tracking endpoint URL is invalid.", error);
      showTrackingMessage("Tracking is not configured correctly. Please contact ATLAS for an update.", true);
      return;
    }
    requestUrl.searchParams.set("reference", reference);
    requestUrl.searchParams.set("callback", "atlasTrackingCallback");
    const requestScript = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      if (completed || requestId !== trackingRequestId) return;
      completed = true;
      requestScript.remove();
      showTrackingMessage("Tracking is taking longer than expected. Please try again or contact ATLAS.", true);
    }, 15000);

    window.atlasTrackingCallback = (response) => {
      if (completed || requestId !== trackingRequestId) return;
      completed = true;
      window.clearTimeout(timeoutId);
      requestScript.remove();
      delete window.atlasTrackingCallback;

      if (
        !response ||
        response.ok !== true ||
        !response.shipment ||
        typeof response.shipment.status !== "string"
      ) {
        showTrackingMessage(
          response && response.code === "not_found"
            ? "We couldn't find that reference. Check it and try again, or contact ATLAS."
            : "We couldn't retrieve the tracking update. Please try again or contact ATLAS.",
          true
        );
        return;
      }

      showTrackingRecord(response.shipment);
    };

    requestScript.onerror = () => {
      if (completed || requestId !== trackingRequestId) return;
      completed = true;
      window.clearTimeout(timeoutId);
      delete window.atlasTrackingCallback;
      showTrackingMessage("We couldn't connect to tracking. Please try again or contact ATLAS.", true);
    };
    requestScript.src = requestUrl.toString();
    document.head.append(requestScript);
  });
}

const year = document.querySelector("#current-year");
if (year) {
  year.textContent = String(new Date().getFullYear());
}
