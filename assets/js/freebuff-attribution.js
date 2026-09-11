/* Same-origin Freebuff wrapper for kotoba.cloud.
 *
 * FIX-PLAN path only: load the tag when a valid bfcid is present (URL or
 * sessionStorage), preserve bfcid + utm_* onto Sign in / Base Account /
 * Connect this Principal links, and fire signup_completed once when a
 * Stable Principal is confirmed. No third-party ad pixel besides Freebuff,
 * no other event names.
 */
(function () {
  "use strict";
  var KEYS = ["bfcid", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
  var SHAPE = /^bfc_[A-Za-z0-9._-]{1,508}$/;
  var TAG_SRC = "https://freebuff.com/freebuff-tag.js";
  var CONVERSION = "signup_completed";
  var STORAGE_CLICK = "bfcid";
  var STORAGE_DONE = "bfcid:signup_completed";
  var IDENTITY_ORIGIN = "https://auth.kotoba.cloud";
  var SIGN_IN_PATHS = { "/sign-in": true, "/login": true, "/signin": true };

  function storageGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (error) {}
  }

  function safeUtm(value) {
    return typeof value === "string" && value && value.length <= 256 &&
      !/[\r\n]/.test(value) ? value : null;
  }

  function clickId(value) {
    return typeof value === "string" && SHAPE.test(value) ? value : null;
  }

  function readAttribution() {
    var incoming = new URLSearchParams(window.location.search);
    var keep = new URLSearchParams();
    KEYS.forEach(function (key) {
      var fromUrl = incoming.get(key);
      var value = key === "bfcid" ? clickId(fromUrl) : safeUtm(fromUrl);
      if (value) {
        storageSet(key === "bfcid" ? STORAGE_CLICK : key, value);
        keep.set(key, value);
        return;
      }
      var stored = storageGet(key === "bfcid" ? STORAGE_CLICK : key);
      value = key === "bfcid" ? clickId(stored) : safeUtm(stored);
      if (value) keep.set(key, value);
    });
    return keep;
  }

  function isTarget(href) {
    if (!href) return false;
    try {
      var target = new URL(href, window.location.origin);
      if (target.origin === IDENTITY_ORIGIN) return true;
      return !!SIGN_IN_PATHS[target.pathname];
    } catch (error) {
      return false;
    }
  }

  function withAttribution(href, keep) {
    if (!href || !keep || !keep.toString()) return href;
    try {
      var target = new URL(href, window.location.origin);
      keep.forEach(function (value, key) {
        target.searchParams.set(key, value);
      });
      var returnTo = target.searchParams.get("return_to");
      if (returnTo) {
        try {
          var back = new URL(returnTo, window.location.origin);
          keep.forEach(function (value, key) {
            back.searchParams.set(key, value);
          });
          target.searchParams.set("return_to", back.toString());
        } catch (error) {}
      }
      if (target.origin === window.location.origin) {
        return target.pathname + target.search + target.hash;
      }
      return target.toString();
    } catch (error) {
      return href;
    }
  }

  function preserveLinks(keep) {
    var attribution = keep || readAttribution();
    if (!attribution.toString()) return;
    Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (link) {
      var href = link.getAttribute("href") || "";
      if (!isTarget(href)) return;
      link.href = withAttribution(href, attribution);
    });
  }

  function loadTag(id) {
    if (!clickId(id) || !document.head) return false;
    window.freebuff = window.freebuff || function () {
      (window.freebuff.q = window.freebuff.q || []).push(arguments);
    };
    if (document.querySelector('script[src="' + TAG_SRC + '"]')) return true;
    var script = document.createElement("script");
    script.async = true;
    script.src = TAG_SRC;
    document.head.appendChild(script);
    return true;
  }

  function onPrincipalConfirmed() {
    var id = clickId(readAttribution().get("bfcid"));
    if (!id) return false;
    if (storageGet(STORAGE_DONE) === id) return false;
    storageSet(STORAGE_DONE, id);
    if (typeof window.freebuff === "function") {
      window.freebuff("conversion", "signup_completed", {
        eventId: id + ":signup_completed"
      });
    }
    return true;
  }

  function boot() {
    var keep = readAttribution();
    var id = clickId(keep.get("bfcid"));
    if (id) loadTag(id);
    preserveLinks(keep);
  }

  window.kotobaCloudFreebuff = {
    keys: KEYS,
    tagSrc: TAG_SRC,
    conversionEvent: CONVERSION,
    readAttribution: readAttribution,
    withAttribution: withAttribution,
    isTarget: isTarget,
    preserveLinks: preserveLinks,
    loadTag: loadTag,
    onPrincipalConfirmed: onPrincipalConfirmed,
    boot: boot
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("kc-principal-confirmed", onPrincipalConfirmed);
})();
