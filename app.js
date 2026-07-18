(function (root) {
  "use strict";

  const STORAGE_KEY = "calendlys.links.v1";
  const MAX_LINKS = 5000;

  const PROVIDERS = [
    { domains: ["calendly.com"], name: "Calendly", color: "#006bff" },
    { domains: ["cal.com"], name: "Cal.com", color: "#1d1d1b" },
    { domains: ["call.com"], name: "Call.com", color: "#6c55f7" },
    { domains: ["savvycal.com"], name: "SavvyCal", color: "#e95f33" },
    { domains: ["tidycal.com"], name: "TidyCal", color: "#e6ad18" },
    { domains: ["zcal.co"], name: "zcal", color: "#7157ff" },
    { domains: ["calendar.google.com", "calendar.app.google"], name: "Google Calendar", color: "#4285f4" },
    { domains: ["outlook.office.com", "outlook.office365.com", "book.ms"], name: "Microsoft Bookings", color: "#0078d4" },
    { domains: ["meetings.hubspot.com"], name: "HubSpot", color: "#ff7a59" }
  ];

  // Used only when a lowercase URL handle has no separators, e.g. eliaspfeffer.
  const FIRST_NAMES = [
    "alexander", "benjamin", "charlotte", "christopher", "danielle", "elizabeth", "frederick",
    "gabriella", "isabella", "jacqueline", "jennifer", "jonathan", "katherine", "margaret",
    "matthew", "michelle", "nicholas", "rebecca", "samantha", "sebastian", "stephanie",
    "victoria", "william", "adrian", "alexandra", "andrew", "anthony", "caroline", "catherine",
    "christian", "daniel", "david", "edward", "eleanor", "emily", "florian", "francesca",
    "george", "hannah", "henry", "james", "jasmine", "jessica", "johannes", "joseph",
    "julia", "julian", "laura", "leonard", "lucas", "madeleine", "marcus", "maria", "martin",
    "maximilian", "melanie", "michael", "natalie", "nathan", "nicole", "oliver", "patrick",
    "paul", "peter", "philipp", "rachel", "richard", "robert", "sarah", "simon", "sophia",
    "stephen", "thomas", "timothy", "vincent", "aaron", "alice", "amanda", "anna", "anne",
    "ben", "chris", "clara", "elias", "emma", "eric", "felix", "frank", "grace", "isabel",
    "jack", "jacob", "jane", "john", "jonas", "josh", "lara", "lena", "leo", "lisa", "louis",
    "luca", "marie", "mark", "maya", "max", "nina", "noah", "olivia", "oscar", "sam", "sophie",
    "theo", "tom"
  ].sort((a, b) => b.length - a.length);

  const GENERIC_SEGMENTS = new Set([
    "book", "booking", "bookings", "calendar", "event", "events", "meet", "meeting", "meetings",
    "schedule", "scheduling", "appointment", "appointments", "reserve", "reservation"
  ]);

  function normalizeUrl(value) {
    const input = String(value || "").trim();
    if (!input) throw new Error("Paste a scheduling link.");

    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    let parsed;
    try {
      parsed = new URL(withProtocol);
    } catch (_error) {
      throw new Error("That does not look like a valid link.");
    }

    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only web links are supported.");
    if (!parsed.hostname || parsed.username || parsed.password) throw new Error("Paste a public scheduling link.");
    parsed.hash = "";
    return parsed.toString();
  }

  function inferProvider(value) {
    const hostname = new URL(normalizeUrl(value)).hostname.toLowerCase().replace(/^www\./, "");
    return PROVIDERS.find((provider) => provider.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)))
      || { name: "Booking link", color: "#73736d" };
  }

  function candidateHandle(value) {
    const parsed = new URL(normalizeUrl(value));
    const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => {
      try { return decodeURIComponent(segment); } catch (_error) { return segment; }
    });
    const useful = segments.find((segment) => !GENERIC_SEGMENTS.has(segment.toLowerCase()) && !/^\d+$/.test(segment));
    if (useful) return useful.replace(/^@/, "");

    const hostParts = parsed.hostname.replace(/^www\./, "").split(".");
    if (hostParts.length > 2 && !["app", "calendar", "meetings", "outlook"].includes(hostParts[0])) return hostParts[0];
    return "";
  }

  function humanizeHandle(handle) {
    let text = String(handle || "")
      .replace(/\.[a-z\d]{2,5}$/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[._+\-]+/g, " ")
      .replace(/\d+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return "Scheduling link";

    if (!text.includes(" ") && /^[a-z]+$/.test(text) && text.length >= 7) {
      const lower = text.toLowerCase();
      const first = FIRST_NAMES.find((name) => lower.startsWith(name) && lower.length - name.length >= 3);
      if (first) text = `${first} ${lower.slice(first.length)}`;
    }

    return text.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  }

  function inferName(value) {
    const handle = candidateHandle(value);
    if (handle) return humanizeHandle(handle);
    return `${inferProvider(value).name} link`;
  }

  function displayHost(value) {
    const parsed = new URL(normalizeUrl(value));
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  }

  function validDate(value) {
    if (!value || Number.isNaN(Date.parse(value))) return null;
    return new Date(value).toISOString();
  }

  function createId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    return `link-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function cleanLink(item) {
    if (!item || typeof item !== "object") throw new Error("A link entry is malformed.");
    const url = normalizeUrl(item.url);
    const name = String(item.name || inferName(url)).trim().slice(0, 80);
    if (!name) throw new Error("A name could not be derived from the link.");
    return {
      id: String(item.id || createId()),
      name,
      url,
      createdAt: validDate(item.createdAt) || new Date().toISOString(),
      updatedAt: validDate(item.updatedAt) || new Date().toISOString()
    };
  }

  function parseImport(text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_error) { throw new Error("That file is not valid JSON."); }

    const entries = Array.isArray(parsed) ? parsed : parsed && parsed.links;
    if (!Array.isArray(entries)) throw new Error("No links were found in that file.");
    if (entries.length > MAX_LINKS) throw new Error("That file contains too many links.");

    const seenIds = new Set();
    return entries.map((entry) => {
      const link = cleanLink(entry);
      while (seenIds.has(link.id)) link.id = createId();
      seenIds.add(link.id);
      return link;
    });
  }

  function exportPayload(links) {
    return JSON.stringify({
      app: "Calendlys",
      version: 1,
      exportedAt: new Date().toISOString(),
      links: links.map(cleanLink)
    }, null, 2);
  }

  const api = { normalizeUrl, inferProvider, inferName, humanizeHandle, displayHost, cleanLink, parseImport, exportPayload };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Calendlys = api;

  if (typeof document === "undefined") return;

  const elements = {
    form: document.querySelector("#quick-add-form"),
    urlInput: document.querySelector("#url-input"),
    search: document.querySelector("#search-input"),
    count: document.querySelector("#link-count"),
    list: document.querySelector("#link-list"),
    empty: document.querySelector("#empty-state"),
    noResults: document.querySelector("#no-results"),
    importButton: document.querySelector("#import-button"),
    importInput: document.querySelector("#import-input"),
    exportButton: document.querySelector("#export-button"),
    syncButton: document.querySelector("#github-sync-button"),
    storageStatus: document.querySelector("#storage-status"),
    toast: document.querySelector("#toast")
  };

  let links = loadLinks();
  let fileConnected = false;
  let toastTimer;

  function loadLinks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? parseImport(raw) : [];
    } catch (error) {
      window.setTimeout(() => showToast(`Could not read saved links: ${error.message}`), 0);
      return [];
    }
  }

  async function persist(nextLinks) {
    let browserSaved = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLinks));
      browserSaved = true;
    } catch (_error) {
      // The local text file can still be the durable copy when browser storage is blocked.
    }

    if (fileConnected) {
      try {
        const response = await fetch("/api/links", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: nextLinks })
        });
        if (!response.ok) throw new Error("Local file write failed");
        return true;
      } catch (_error) {
        fileConnected = false;
        elements.storageStatus.textContent = "Browser storage · local file disconnected";
      }
    }

    if (browserSaved) return true;
    showToast("Could not save locally.");
    return false;
  }

  function render() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const sorted = [...links].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const visible = query
      ? sorted.filter((link) => `${link.name} ${link.url} ${inferProvider(link.url).name}`.toLocaleLowerCase().includes(query))
      : sorted;

    elements.list.replaceChildren(...visible.map(createRow));
    elements.count.textContent = String(links.length);
    elements.empty.hidden = links.length !== 0;
    elements.noResults.hidden = links.length === 0 || visible.length !== 0;
  }

  function createRow(link) {
    const provider = inferProvider(link.url);
    const row = el("article", "link-row");
    row.dataset.id = link.id;

    const person = el("div", "person");
    const heading = el("h2", "person-name", link.name);
    heading.tabIndex = 0;
    heading.title = "Double-click to rename";
    heading.setAttribute("role", "button");
    heading.setAttribute("aria-label", `${link.name}; double-click or press Enter to rename`);
    heading.addEventListener("dblclick", () => beginRename(link, heading));
    heading.addEventListener("keydown", (event) => {
      if (event.key === "Enter") beginRename(link, heading);
    });
    person.append(heading);

    const meta = el("div", "link-meta");
    const providerElement = el("span", "provider", provider.name);
    providerElement.style.setProperty("--provider-color", provider.color);
    meta.append(providerElement, el("p", "host", displayHost(link.url)));

    const actions = el("div", "row-actions");
    const copy = el("button", "action-button copy", "Copy");
    copy.type = "button";
    copy.addEventListener("click", () => copyLink(link));

    const visit = el("a", "action-button visit", "Open ↗");
    visit.href = link.url;
    visit.target = "_blank";
    visit.rel = "noopener noreferrer";
    visit.setAttribute("aria-label", `Open ${link.name}'s scheduling link in a new tab`);

    const remove = el("button", "delete-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${link.name}`);
    remove.addEventListener("click", () => deleteLink(link));

    actions.append(copy, visit, remove);
    row.append(person, meta, actions);
    return row;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function beginRename(link, heading) {
    if (!heading.isConnected || heading.parentElement.querySelector(".name-editor")) return;

    const input = el("input", "name-editor");
    input.type = "text";
    input.value = link.name;
    input.maxLength = 80;
    input.setAttribute("aria-label", `Rename ${link.name}`);
    heading.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const cancel = () => {
      if (finished) return;
      finished = true;
      render();
    };
    const commit = async () => {
      if (finished) return;
      const name = input.value.trim();
      if (!name) {
        showToast("Name cannot be empty");
        input.focus();
        return;
      }
      if (name === link.name) {
        cancel();
        return;
      }

      finished = true;
      input.disabled = true;
      const nextLinks = links.map((item) => item.id === link.id
        ? { ...item, name: name.slice(0, 80), updatedAt: new Date().toISOString() }
        : item);
      if (!await persist(nextLinks)) {
        render();
        return;
      }
      links = nextLinks;
      render();
      showToast(`Renamed to ${name.slice(0, 80)}`);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", commit);
  }

  async function addLink(event) {
    event.preventDefault();
    let url;
    try {
      url = normalizeUrl(elements.urlInput.value);
      elements.urlInput.removeAttribute("aria-invalid");
    } catch (error) {
      elements.urlInput.setAttribute("aria-invalid", "true");
      showToast(error.message);
      elements.urlInput.focus();
      return;
    }

    if (links.some((link) => link.url === url)) {
      showToast("That link is already saved");
      elements.urlInput.select();
      return;
    }
    if (links.length >= MAX_LINKS) {
      showToast("The link limit has been reached");
      return;
    }

    const link = cleanLink({ url });
    const nextLinks = [...links, link];
    if (!await persist(nextLinks)) return;
    links = nextLinks;
    elements.urlInput.value = "";
    elements.search.value = "";
    render();
    showToast(`${link.name} added`);
    elements.urlInput.focus();
  }

  async function deleteLink(link) {
    if (!window.confirm(`Delete ${link.name}?`)) return;
    const nextLinks = links.filter((item) => item.id !== link.id);
    if (!await persist(nextLinks)) return;
    links = nextLinks;
    render();
    showToast(`${link.name} deleted`);
  }

  async function copyLink(link) {
    try {
      await navigator.clipboard.writeText(link.url);
      showToast(`${link.name}'s link copied`);
    } catch (_error) {
      const textarea = document.createElement("textarea");
      textarea.value = link.url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      showToast(copied ? `${link.name}'s link copied` : "Could not copy the link");
    }
  }

  function exportLinks() {
    if (!links.length) {
      showToast("Add a link before exporting");
      return;
    }
    const blob = new Blob([exportPayload(links)], { type: "application/json" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `calendlys-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
    showToast("Backup exported");
  }

  async function importLinks(file) {
    if (!file) return;
    try {
      const imported = parseImport(await file.text());
      if (!imported.length) throw new Error("That backup contains no links.");
      if (links.length && !window.confirm(`Import ${imported.length} links and replace your current list?`)) return;
      if (!await persist(imported)) return;
      links = imported;
      elements.search.value = "";
      render();
      showToast(`${imported.length} ${imported.length === 1 ? "link" : "links"} imported`);
    } catch (error) {
      showToast(error.message);
    } finally {
      elements.importInput.value = "";
    }
  }

  async function connectLocalFile() {
    try {
      const response = await fetch("/api/links", { cache: "no-store" });
      if (!response.ok) throw new Error("Local file API unavailable");
      const payload = await response.json();
      const fileLinks = parseImport(JSON.stringify({ links: payload.links }));
      fileConnected = true;
      elements.storageStatus.textContent = "Saved to data/calendlys.txt";

      if (fileLinks.length) {
        links = fileLinks;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(links)); } catch (_error) { /* file remains primary */ }
        render();
      } else if (links.length) {
        await persist(links);
      }
    } catch (_error) {
      fileConnected = false;
      elements.storageStatus.textContent = "Browser storage · run python3 server.py for local file";
    }
  }

  async function syncGithub() {
    elements.syncButton.disabled = true;
    const originalText = elements.syncButton.textContent;
    elements.syncButton.textContent = "Pushing…";
    try {
      const response = await fetch("/api/github-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "GitHub push failed");
      fileConnected = true;
      elements.storageStatus.textContent = "Saved to data/calendlys.txt";
      showToast(`${payload.message} to GitHub`);
    } catch (error) {
      showToast(error.message === "GitHub push failed" ? error.message : `Could not push: ${error.message}`);
    } finally {
      elements.syncButton.disabled = false;
      elements.syncButton.textContent = originalText;
    }
  }

  function showToast(message) {
    if (!elements.toast) return;
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2200);
  }

  elements.form.addEventListener("submit", addLink);
  elements.urlInput.addEventListener("input", () => elements.urlInput.removeAttribute("aria-invalid"));
  elements.search.addEventListener("input", render);
  elements.exportButton.addEventListener("click", exportLinks);
  elements.syncButton.addEventListener("click", syncGithub);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", () => importLinks(elements.importInput.files[0]));

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    try {
      links = event.newValue ? parseImport(event.newValue) : [];
      render();
      showToast("Links updated in another tab");
    } catch (_error) {
      showToast("Could not sync changes from another tab");
    }
  });

  document.addEventListener("keydown", (event) => {
    const isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      elements.search.focus();
    }
  });

  render();
  connectLocalFile();
})(typeof globalThis !== "undefined" ? globalThis : window);
