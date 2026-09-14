// Which browsers get the PDF viewer and which get the old frame.
//
// Run with:   npm test
//
// Each line is a real browser's own description of itself (its "user
// agent"). HUAWEI_15 is what the tablet at Bending is expected to send; it
// must get the viewer, which is the reason the app is on PDF.js 4.10.38.

import { test } from "node:test";
import assert from "node:assert/strict";
import { tooOldForPdfjs, browserVersion } from "./pdfSupport.js";

const HUAWEI_15 =
  "Mozilla/5.0 (Linux; Android 12; HarmonyOS; DCO-AL00; HMSCore 6.14.0.322) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.9.300 Mobile Safari/537.36";
const HUAWEI_12 =
  "Mozilla/5.0 (Linux; Android 10; HarmonyOS; ELE-AL00; HMSCore 6.4.0.312) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.105 HuaweiBrowser/12.0.5.302 Mobile Safari/537.36";
const CHROME_PC =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.76 Safari/537.36";
const SAMSUNG_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X110) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/130.0.0.0 Safari/537.36";
const IPAD_16_3 =
  "Mozilla/5.0 (iPad; CPU OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1";
const IPAD_16_4 =
  "Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1";
const IPAD_17 =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_SAFARI_18 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const FIREFOX_ANDROID = "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const CHROME_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1";

test("the Huawei tablet's current browser gets the viewer", () => {
  assert.equal(tooOldForPdfjs(HUAWEI_15), false);
});

test("an older Huawei browser, below Chrome 103, gets the frame", () => {
  assert.equal(tooOldForPdfjs(HUAWEI_12), true);
});

test("an up-to-date PC and Samsung tablet get the viewer", () => {
  assert.equal(tooOldForPdfjs(CHROME_PC), false);
  assert.equal(tooOldForPdfjs(SAMSUNG_TABLET), false);
});

test("Safari from 16.4 gets the viewer, 16.3 the frame", () => {
  assert.equal(tooOldForPdfjs(IPAD_16_3), true);
  assert.equal(tooOldForPdfjs(IPAD_16_4), false);
  assert.equal(tooOldForPdfjs(IPAD_17), false);
  assert.equal(tooOldForPdfjs(MAC_SAFARI_18), false);
});

test("Firefox and anything unrecognised get the viewer, with its time limit behind it", () => {
  assert.equal(tooOldForPdfjs(FIREFOX_ANDROID), false);
  assert.equal(tooOldForPdfjs(CHROME_ON_IPHONE), false);
  assert.equal(tooOldForPdfjs("SomethingNew/1.0"), false);
});

test("the message names the browser and its engine", () => {
  assert.equal(browserVersion(HUAWEI_15), "Chrome/114.0.5735.196, HuaweiBrowser/15.0.9.300");
  assert.equal(browserVersion(CHROME_PC), "Chrome/152.0.7977.76");
  assert.equal(browserVersion("SomethingNew/1.0"), "SomethingNew/1.0");
});
