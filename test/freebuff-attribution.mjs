import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)),
    "..", "assets", "js", "freebuff-attribution.js"),
  "utf8"
);

function run({ search = "", stored = {}, links = [] } = {}) {
  const store = { ...stored };
  const appended = [];
  const anchors = links.map((href) => {
    let current = href;
    return {
      getAttribute(name) { return name === "href" ? current : null; },
      set href(next) { current = next; },
      get href() { return current; }
    };
  });
  const scripts = [];
  const document = {
    readyState: "complete",
    head: { appendChild(node) { appended.push(node); } },
    querySelector(sel) {
      return scripts.find((s) => sel.includes(s.src)) || null;
    },
    querySelectorAll(sel) {
      return sel === "a[href]" ? anchors : [];
    },
    createElement(tag) {
      const node = { tagName: tag, async: false, src: "" };
      scripts.push(node);
      return node;
    },
    addEventListener() {}
  };
  const sessionStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) { store[key] = String(value); }
  };
  const window = {
    location: { search, origin: "https://kotoba.cloud" },
    sessionStorage,
    document
  };
  vm.runInNewContext(source, { window, document, sessionStorage, URL, URLSearchParams });
  return {
    api: window.kotobaCloudFreebuff,
    appended,
    store,
    anchors,
    queue() {
      return (window.freebuff && window.freebuff.q)
        ? Array.from(window.freebuff.q).map((item) => Array.from(item))
        : [];
    }
  };
}

const click = "bfc_testclick1";

const organic = run({ search: "", links: ["https://auth.kotoba.cloud/sign-in"] });
assert.equal(organic.appended.length, 0, "organic visitors do not load Freebuff");
assert.equal(organic.anchors[0].href, "https://auth.kotoba.cloud/sign-in");
assert.equal(organic.api.onPrincipalConfirmed(), false, "no bfcid means no conversion");

const landing = run({
  search: `?bfcid=${click}&utm_source=go&utm_medium=cpc&utm_campaign=cloud&utm_content=signin`,
  links: [
    "https://auth.kotoba.cloud/sign-in?return_to=https%3A%2F%2Fkotoba.cloud%2F",
    "https://auth.kotoba.cloud/connect?target=kotobase",
    "/signin",
    "https://kotoba-lang.org/#start"
  ]
});
assert.equal(landing.appended.length, 1);
assert.equal(landing.appended[0].src, "https://freebuff.com/freebuff-tag.js");
assert.equal(landing.appended[0].async, true);
assert.equal(landing.store.bfcid, click);
assert.ok(landing.anchors[0].href.includes(`bfcid=${click}`));
assert.ok(decodeURIComponent(new URL(landing.anchors[0].href).searchParams.get("return_to")).includes(click));
assert.ok(landing.anchors[1].href.includes(`bfcid=${click}`));
assert.ok(landing.anchors[2].href.includes(click));
assert.equal(landing.anchors[3].href, "https://kotoba-lang.org/#start");

const returned = run({
  search: "",
  stored: { bfcid: click },
  links: ["https://auth.kotoba.cloud/connect?target=kotobase"]
});
assert.equal(returned.appended.length, 1, "sessionStorage bfcid still loads the tag after auth return");
assert.ok(returned.anchors[0].href.includes(click));

const confirmed = run({ search: `?bfcid=${click}` });
assert.equal(confirmed.api.onPrincipalConfirmed(), true);
assert.equal(confirmed.queue()[0][0], "conversion");
assert.equal(confirmed.queue()[0][1], "signup_completed");
assert.equal(confirmed.queue()[0][2].eventId, `${click}:signup_completed`);
assert.equal(confirmed.api.onPrincipalConfirmed(), false, "conversion fires once per click id");
assert.equal(confirmed.queue().length, 1);

const replay = run({
  search: `?bfcid=${click}`,
  stored: { "bfcid:signup_completed": click }
});
assert.equal(replay.api.onPrincipalConfirmed(), false);

assert.equal(/\bgtag\s*\(/.test(source), false);
assert.equal(source.includes("googletagmanager"), false);
assert.equal(/openai.?ads/i.test(source), false);
assert.equal(/\bGMV\b/.test(source), false);

console.log("freebuff attribution wrapper: bfcid-only tag, preserve onto sign-in, signup_completed once");
