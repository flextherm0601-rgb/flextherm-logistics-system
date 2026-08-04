/**
 * 国际物流报价小程序 —— API 代理（Cloudflare Workers 版）
 *
 * 用途：把网页里的两个实时报价接口统一走一个 HTTPS 代理，密钥只存在 Worker 环境变量里，
 * 浏览器页面不会接触密钥。部署后把 Worker 地址填入网页「实时报价设置」：
 *   - 4PX 服务地址：https://你的worker.workers.dev  （页面请求 /api/4px/quote）
 *   - Easyship 代理地址：https://你的worker.workers.dev （页面请求 /api/es/rates）
 *
 * 部署步骤：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → 创建 Worker；
 *   2. 把本文件内容粘贴进 Worker 编辑器并保存；
 *   3. 在 Worker 设置 → 变量 中添加：
 *        FOURPX_APP_KEY    = 你的 4PX AppKey
 *        FOURPX_SECRET_KEY = 你的 4PX Secret Key
 *        EASYSHIP_TOKEN    = 你的 Easyship API 令牌（Bearer token）
 *      （FOURPX_TEST 可留空；如需联调测试环境可设为 "1"）
 *   4. 复制 Worker 的 *.workers.dev 地址，填入网页设置。
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-easyship-token",
  "Access-Control-Max-Age": "86400",
};

const EASYSHIP_RATES_URL = "https://public-api.easyship.com/2024-09/rates";

function corsHeaders(extra) {
  return { ...CORS, "Content-Type": "application/json; charset=utf-8", ...(extra || {}) };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

/* ---------------- 4PX 签名与请求 ---------------- */
/* 纯 JS MD5（Cloudflare Workers 的 Web Crypto 不支持 MD5） */
const MD5 = (function () {
  function safeAdd(x, y) { const lsw = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff); }
  function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
  function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
  function binlMD5(x, len) {
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d;
      a = md5ff(a, b, c, d, x[i], 7, -680876936); d = md5ff(d, a, b, c, x[i + 1], 12, -389564586); c = md5ff(c, d, a, b, x[i + 2], 17, 606105819); b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897); d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426); c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417); c = md5ff(c, d, a, b, x[i + 10], 17, -42063); b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, x[i + 13], 12, -40341101); c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510); d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632); c = md5gg(c, d, a, b, x[i + 11], 14, 643717713); b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691); d = md5gg(d, a, b, c, x[i + 10], 9, 38016083); c = md5gg(c, d, a, b, x[i + 15], 14, -660478335); b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438); d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690); c = md5gg(c, d, a, b, x[i + 3], 14, -187363961); b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, x[i + 2], 9, -51403784); c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
      a = md5hh(a, b, c, d, x[i + 5], 4, -378558); d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463); c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353); c = md5hh(c, d, a, b, x[i + 7], 16, -155497632); b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174); d = md5hh(d, a, b, c, x[i], 11, -358537222); c = md5hh(c, d, a, b, x[i + 3], 16, -722521979); b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487); d = md5hh(d, a, b, c, x[i + 12], 11, -421815835); c = md5hh(c, d, a, b, x[i + 15], 16, 530742520); b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
      a = md5ii(a, b, c, d, x[i], 6, -198630844); d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415); c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606); c = md5ii(c, d, a, b, x[i + 10], 15, -1051523); b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, x[i + 15], 10, -30611744); c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070); d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379); c = md5ii(c, d, a, b, x[i + 2], 15, 718787259); b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
      a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }
  function binl2hex(binarray) {
    const hexTab = "0123456789abcdef";
    let str = "";
    for (let i = 0; i < binarray.length * 4; i++) {
      str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) + hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xf);
    }
    return str;
  }
  function utf8Encode(str) {
    let out = "";
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) { out += String.fromCharCode(c); }
      else if (c > 0x7ff) { out += String.fromCharCode(0xe0 | ((c >> 12) & 0xf), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
      else { out += String.fromCharCode(0xc0 | ((c >> 6) & 0x1f), 0x80 | (c & 0x3f)); }
    }
    return out;
  }
  function str2binl(str) {
    const bytes = [];
    for (let i = 0; i < str.length * 8; i += 8) {
      bytes[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << (i % 32);
    }
    return bytes;
  }
  return function md5(str) {
    const s = utf8Encode(str);
    return binl2hex(binlMD5(str2binl(s), s.length * 8));
  };
})();

function buildSign(common, bodyJson, secretKey) {
  const sortedKeys = Object.keys(common).sort();
  let raw = sortedKeys.map((k) => k + common[k]).join("");
  return raw + bodyJson + secretKey;
}

async function call4px(env, method, v, biz) {
  const timestamp = Date.now();
  const bodyJson = JSON.stringify(biz);
  const common = {
    app_key: env.FOURPX_APP_KEY,
    format: "json",
    method,
    timestamp: String(timestamp),
    v,
  };
  const raw = buildSign(common, bodyJson, env.FOURPX_SECRET_KEY);
  const sign = MD5(raw);

  const query = new URLSearchParams({
    method,
    app_key: env.FOURPX_APP_KEY,
    v,
    timestamp: String(timestamp),
    format: "json",
    language: "cn",
    sign,
  });
  const base = env.FOURPX_TEST === "1"
    ? "https://open-test.4px.com/router/api/service"
    : "https://open.4px.com/router/api/service";
  const res = await fetch(`${base}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyJson,
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { result: "0", msg: "非JSON响应", raw: text.slice(0, 500) }; }
  return parsed;
}

function parse4pxData(res) {
  let data = res && res.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return []; }
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const candidates = [data.list, data.items, data.data, data.logistics_product_list, data.logistics_products];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
  }
  return [];
}

function normTransit(t) {
  if (!t) return "—";
  return String(t).trim().replace(/\s*-\s*/g, "-");
}

const nameCache = new Map();
let nameCacheAt = 0;

async function getProductNames(env) {
  if (nameCache.size && Date.now() - nameCacheAt < 10 * 60 * 1000) return nameCache;
  try {
    const res = await call4px(env, "ds.xms.logistics_product.getlist", "1.0", {
      transport_mode: "1",
      source_country_code: "CN",
      dest_country_code: "AU",
    });
    const list = parse4pxData(res);
    for (const p of list) {
      if (p.logistics_product_code) {
        nameCache.set(p.logistics_product_code, p.logistics_product_name_cn || p.logistics_product_name_en || p.logistics_product_code);
      }
    }
    nameCacheAt = Date.now();
  } catch (e) { /* keep whatever is cached */ }
  return nameCache;
}

async function handle4pxQuote(req, env) {
  if (!env.FOURPX_APP_KEY || !env.FOURPX_SECRET_KEY || String(env.FOURPX_APP_KEY).startsWith("YOUR_")) {
    return json({ ok: false, error: "4PX 未配置：请在 Worker 变量中设置 FOURPX_APP_KEY / FOURPX_SECRET_KEY" }, 200);
  }
  let body = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "请求体不是合法 JSON" }, 400); }
  const parcels = Array.isArray(body.parcels) ? body.parcels : [];
  const cartons = Math.max(1, parseInt(body.cartons, 10) || 1);
  if (!parcels.length) return json({ ok: false, error: "缺少 parcels（包裹尺寸/重量）" }, 400);
  for (const p of parcels) {
    if (!(p.weightG > 0) || !(p.lengthCm > 0) || !(p.widthCm > 0) || !(p.heightCm > 0)) {
      return json({ ok: false, error: "每个包裹都需要 weightG / lengthCm / widthCm / heightCm 且大于 0" }, 400);
    }
    if (p.quantity != null && (!(Number(p.quantity) >= 1) || !Number.isInteger(Number(p.quantity)))) {
      return json({ ok: false, error: "包裹 quantity 必须是大于等于 1 的整数" }, 400);
    }
  }

  const rateMap = new Map();
  const names = await getProductNames(env);
  for (const p of parcels) {
    const quantity = Math.max(1, Number(p.quantity) || 1);
    const res4 = await call4px(env, "ds.xms.estimated_cost.get", "1.0", {
      request_no: "",
      country_code: body.countryCode || "AU",
      weight: String(p.weightG),
      length: String(p.lengthCm),
      width: String(p.widthCm),
      height: String(p.heightCm),
      cargocode: "P",
      logistics_product_code: body.productCodes || [],
      recipient_post_code: body.postCode || "",
    });
    if (String(res4.result) !== "1") {
      return json({ ok: false, error: String(res4.msg || res4.errors || "4PX 试算失败") }, 200);
    }
    const list = parse4pxData(res4);
    for (const item of list) {
      const code = item.logistics_product_code || "UNKNOWN";
      const perCarton = Number(item.lump_sum_fee) || 0;
      if (!(perCarton > 0)) continue;
      const current = rateMap.get(code) || {
        id: code,
        productCode: code,
        name: names.get(code) ? code + " " + names.get(code) : code,
        total: 0,
        chargeWeight: 0,
        transit: normTransit(item.estimated_time),
        isTrack: item.is_show_track,
        remarks: item.remarks || "",
        incoterms: "DAP",
        cur: "CNY",
        source: "4PX",
        parcelCount: 0,
      };
      current.total += perCarton * quantity;
      current.chargeWeight += (Number(item.charge_weight) || 0) * quantity;
      current.parcelCount += 1;
      current.cartonCount = (current.cartonCount || 0) + quantity;
      rateMap.set(code, current);
    }
  }
  const rates = Array.from(rateMap.values())
    .filter((r) => r.parcelCount === parcels.length)
    .map((r) => ({
      ...r,
      perCarton: Math.round((r.total / r.cartonCount) * 100) / 100,
      total: Math.round(r.total * 100) / 100,
      chargeWeight: Math.round(r.chargeWeight * 1000) / 1000,
    }));
  if (!rates.length) return json({ ok: false, error: "4PX 未返回可用的空运报价（可能未开通澳洲渠道）" }, 200);
  rates.sort((a, b) => a.total - b.total);
  return json({ ok: true, rates, fetchedAt: new Date().toISOString(), cartons, source: "4PX" });
}

/* ---------------- Easyship 代理 ---------------- */
async function handleEsRates(req, env) {
  const token = req.headers.get("x-easyship-token") || env.EASYSHIP_TOKEN || "";
  if (!token) {
    return json({ error: "Missing Easyship token: set EASYSHIP_TOKEN env var in the Worker or send x-easyship-token header" }, 400);
  }
  let body = "";
  try { body = await req.text(); } catch { body = ""; }
  const upstream = await fetch(EASYSHIP_RATES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body,
  });
  const text = await upstream.text();
  if (!upstream.ok) {
    let detail = text.slice(0, 800);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message || (parsed.error && (parsed.error.message || parsed.error.code)) || detail;
    } catch (_) {}
    const help = upstream.status === 401 || upstream.status === 403
      ? "Easyship 令牌无效或缺少 public.rate:read 权限，请在 API & Webhooks 中重新创建 API connection 并启用该权限。"
      : upstream.status === 402
        ? "Easyship 当前订阅不支持 Rates API，需在 Subscription 中启用支持该接口的套餐。"
        : "Easyship 请求失败。";
    return json({ error: { code: "EASYSHIP_" + upstream.status, message: help, detail } }, upstream.status);
  }
  return new Response(text, { status: upstream.status, headers: corsHeaders() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        provider: "4PX + Easyship (Cloudflare Worker)",
        configured: !!(env.FOURPX_APP_KEY && env.FOURPX_SECRET_KEY),
        fourpxConfigured: !!(env.FOURPX_APP_KEY && env.FOURPX_SECRET_KEY),
        easyshipConfigured: !!env.EASYSHIP_TOKEN,
      });
    }
    try {
      if (url.pathname === "/api/4px/quote" && request.method === "POST") {
        return await handle4pxQuote(request, env);
      }
      if (url.pathname === "/api/es/rates" && request.method === "POST") {
        return await handleEsRates(request, env);
      }
    } catch (error) {
      return json({ ok: false, error: "上游报价服务暂时不可用，请稍后重试", detail: String(error && error.message || error) }, 502);
    }
    return json({ error: "Not Found" }, 404);
  },
};
