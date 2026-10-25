// 鉴权:给所有 /api/ 请求自动带上密钥。密钥只存在这台手机的浏览器里,第一次打开会问一次。
(function () {
  const raw = window.fetch.bind(window);
  function getKey(force) {
    let k = null;
    try { k = localStorage.getItem('reverie_key'); } catch (e) {}
    if (!k || force) {
      k = prompt('输入 Reverie 密钥') || '';
      try { if (k) localStorage.setItem('reverie_key', k); } catch (e) {}
    }
    return k || '';
  }
  window.fetch = async function (url, opts = {}) {
    if (!String(url).includes('/api/')) return raw(url, opts);
    const send = (key) => raw(url, { ...opts, headers: { ...(opts.headers || {}), 'X-Api-Key': key } });
    let r = await send(getKey(false));
    if (r.status === 401) r = await send(getKey(true));
    return r;
  };
})();

















