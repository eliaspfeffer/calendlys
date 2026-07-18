const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUrl,
  inferProvider,
  inferName,
  humanizeHandle,
  displayHost,
  cleanLink,
  parseImport,
  exportPayload,
  renameLink
} = require("./app.js");

test("normalizeUrl adds HTTPS when omitted", () => {
  assert.equal(normalizeUrl("cal.com/eliaspfeffer"), "https://cal.com/eliaspfeffer");
});

test("normalizeUrl keeps query parameters and removes fragments", () => {
  assert.equal(
    normalizeUrl("https://calendly.com/lee/intro?month=2026-07#details"),
    "https://calendly.com/lee/intro?month=2026-07"
  );
});

test("normalizeUrl rejects unsafe, credentialed, or malformed links", () => {
  assert.throws(() => normalizeUrl("ftp://example.com"), /Only web links/);
  assert.throws(() => normalizeUrl("https://user:secret@example.com"), /public scheduling link/);
  assert.throws(() => normalizeUrl("not a url"), /valid link/);
});

test("inferProvider recognizes common scheduling services and subdomains", () => {
  assert.equal(inferProvider("https://calendly.com/name").name, "Calendly");
  assert.equal(inferProvider("https://cal.com/name").name, "Cal.com");
  assert.equal(inferProvider("https://meetings.hubspot.com/name").name, "HubSpot");
  assert.equal(inferProvider("https://booking.example.org/name").name, "Booking link");
});

test("inferName derives the requested Cal.com name directly from the URL", () => {
  assert.equal(inferName("https://cal.com/eliaspfeffer"), "Elias Pfeffer");
});

test("inferName handles separators, camel case, event paths, and encoded handles", () => {
  assert.equal(inferName("https://calendly.com/maya-chen/coffee"), "Maya Chen");
  assert.equal(inferName("https://cal.com/mayaChen/coffee"), "Maya Chen");
  assert.equal(inferName("https://example.com/book/alex_smith"), "Alex Smith");
  assert.equal(inferName("https://example.com/jane%20doe"), "Jane Doe");
});

test("humanizeHandle leaves normal single-word handles readable", () => {
  assert.equal(humanizeHandle("team"), "Team");
});

test("displayHost produces a compact readable address", () => {
  assert.equal(displayHost("https://www.calendly.com/maya/chat/"), "calendly.com/maya/chat");
  assert.equal(displayHost("https://example.com/"), "example.com");
});

test("cleanLink derives a missing name and preserves valid metadata", () => {
  const item = cleanLink({
    id: "123",
    url: "cal.com/eliaspfeffer",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z"
  });
  assert.deepEqual(item, {
    id: "123",
    name: "Elias Pfeffer",
    url: "https://cal.com/eliaspfeffer",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z"
  });
});

test("parseImport accepts backup objects and legacy arrays", () => {
  const entry = { id: "1", name: "Alex", url: "https://example.com/book" };
  assert.equal(parseImport(JSON.stringify({ links: [entry] }))[0].name, "Alex");
  assert.equal(parseImport(JSON.stringify([entry]))[0].url, "https://example.com/book");
});

test("parseImport makes duplicate imported IDs unique", () => {
  const entries = [
    { id: "same", name: "Alex", url: "example.com/alex" },
    { id: "same", name: "Blair", url: "example.com/blair" }
  ];
  const imported = parseImport(JSON.stringify(entries));
  assert.notEqual(imported[0].id, imported[1].id);
});

test("parseImport explains invalid backups", () => {
  assert.throws(() => parseImport("not json"), /not valid JSON/);
  assert.throws(() => parseImport(JSON.stringify({ items: [] })), /No links/);
});

test("renameLink updates exactly one entry without mutating the source", () => {
  const source = [
    { id: "1", name: "Old Name", url: "https://cal.com/old", updatedAt: "before" },
    { id: "2", name: "Other Name", url: "https://cal.com/other", updatedAt: "before" }
  ];
  const renamed = renameLink(source, "1", "  New Name  ", "2026-07-18T12:00:00.000Z");

  assert.equal(renamed[0].name, "New Name");
  assert.equal(renamed[0].updatedAt, "2026-07-18T12:00:00.000Z");
  assert.deepEqual(renamed[1], source[1]);
  assert.equal(source[0].name, "Old Name");
});

test("renameLink rejects empty names and missing entries", () => {
  const source = [{ id: "1", name: "Old Name", url: "https://cal.com/old" }];
  assert.throws(() => renameLink(source, "1", "   "), /empty/);
  assert.throws(() => renameLink(source, "missing", "New Name"), /not found/);
});

test("exportPayload creates a round-trippable versioned backup", () => {
  const source = [{ id: "1", name: "Sam Lee", url: "https://cal.com/sam-lee" }];
  const payload = JSON.parse(exportPayload(source));
  assert.equal(payload.app, "Calendlys");
  assert.equal(payload.version, 1);
  assert.equal(payload.links.length, 1);
  assert.equal(parseImport(JSON.stringify(payload))[0].name, "Sam Lee");
});
