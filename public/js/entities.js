// HTMLの文字参照（&amp; &#39; &quot; など）を元の文字に戻す。
// YouTube Data API の search は、題名とチャンネル名をHTMLエスケープ済みで返すため。
// 文字列の置換だけで戻す（innerHTML などDOMを使わない）ので、タグが作られることはなく、
// ブラウザからも Node（scripts/lib/youtube.js）からも同じものを使える。
const NAMED = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
]);

// 1回だけ戻す（"&amp;lt;" は "&lt;" になり、"<" までは戻さない）。知らない名前はそのまま残す
export function decodeEntities(text) {
  if (typeof text !== 'string' || !text.includes('&')) return text;
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-z]+));/g, (match, dec, hex, name) => {
    if (name) return NAMED.get(name) ?? match;
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}
