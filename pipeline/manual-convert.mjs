// 公式PDF（裁判所規則・法務省準則）の抽出テキストを data/manual 形式に変換する
//
// 使い方:
//   node pipeline/manual-convert.mjs <courts|junsoku> <input.pdf|input.txt> <output.txt>
//
//   courts  … 最高裁判所規則の横書き変換PDF（条番号が漢数字、区切りが半角スペース2つ）
//   junsoku … 法務省通達・準則系PDF（条番号が全角算用数字）
//
// .pdf を渡す場合は devDependency の pdf-parse が必要（npm i -D pdf-parse@1.1.1）
import { readFileSync, writeFileSync } from "node:fs";

const [preset, input, output] = process.argv.slice(2);
if (!preset || !input || !output) {
  console.error("usage: node pipeline/manual-convert.mjs <courts|junsoku> <input.pdf|txt> <output.txt>");
  process.exit(1);
}

const KAN = "[一二三四五六七八九十百]";
const PRESETS = {
  courts: {
    part: new RegExp(`^第${KAN}+編[\\s　]`),
    chapter: new RegExp(`^第${KAN}+章[\\s　]`),
    section: new RegExp(`^第${KAN}+[節款目][\\s　]`),
    article: new RegExp(`^(第${KAN}+条(?:の${KAN}+)*)[\\s　]+`),
    paragraph: /^(?:[２-９]|[１-９][０-９])[\s　]+/,
    item: new RegExp(`^${KAN}+(?:の${KAN}+)*[\\s　]+`),
    subitem: /^[イロハニホヘトチリヌルヲワカヨタレソ][\s　]+/,
    amendNote: /^（.*(最裁規|裁規|最高裁判所規則).*(改正|追加|削除)）\s*$/,
    endBody: /^(附\s*則|別[記表]|付録)/,
  },
  junsoku: {
    part: /^$ ^/, // 編なし
    chapter: /^第[０-９0-9]+章[\s　]/,
    section: /^第[０-９0-9]+[節款][\s　]/,
    article: /^(第[０-９0-9]+条(?:の[０-９0-9]+)*)[\s　]+/,
    paragraph: /^(?:[２-９]|[１-９][０-９])[\s　]+/,
    item: /^[（(][０-９0-9]+[）)][\s　]*/,
    subitem: /^[アイウエオカキクケコサシスセソ][\s　]+/,
    amendNote: /^（.*(民二|民三)第.*(改正|追加|削除)）\s*$/,
    endBody: /^附\s*則/,
    // 行頭に押し出された句読点（「、。第６８条…」「（、第１３５条…」）を除去
    preLine: (l) => l.replace(/^[、。]+/, "").replace(/^（、+(?=第[０-９0-9])/, ""),
    // 法務省PDFの抽出癖: 句読点がテキスト層内で本来の位置からずれる（「。）」の「。」が
    // 行末へ移動、「、」がクラスタ化など）。乱れの兆候がある行のみ修復する:
    //   「 ）」→「。）」復元 / 「、」クラスタ・「。、」の正規化 /
    //   迷い句点（平仮名続きで文頭語でないもの）の除去
    postJoin: (s) => {
      if (!/ ）|、、|。、|、\s|\s[。、]|第、/.test(s)) return s;
      s = s.replace(/ ）/g, "。）");
      s = s.replace(/\s+([。、])/g, "$1").replace(/([。、])\s+(?=[^\s])/g, "$1");
      s = s.replace(/。、+/g, "。").replace(/、{2,}/g, "、");
      s = s.replace(/第、+(?=[０-９0-9])/g, "第");
      s = s.replace(/。(?!ただし|この|その|もっとも|なお|また)(?=[ぁ-ん])/g, "");
      return s;
    },
  },
};
const P = PRESETS[preset];
if (!P) throw new Error(`unknown preset: ${preset}`);

// ---- テキスト取得 ----
let raw;
if (input.endsWith(".pdf")) {
  const { default: pdfParse } = await import("pdf-parse").catch(() => {
    throw new Error("pdf-parse がありません: npm i -D pdf-parse@1.1.1");
  });
  raw = (await pdfParse(readFileSync(input))).text;
} else {
  raw = readFileSync(input, "utf8");
}

const caption = /^（.+）\s*$/;
const isPageNo = (l) => /^[-‐−–ー\s]*[0-9０-９]+[-‐−–ー\s]*$/.test(l);

const physical = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/\s+$/, "").trim())
  .map((l) => (P.preLine ? P.preLine(l) : l))
  .filter((l) => l && !isPageNo(l) && !P.amendNote.test(l));

// ---- 条番号の数値変換（連結削除条の展開に使用） ----
const KAN_DIG = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const kanToInt = (s) => {
  let n = 0, cur = 0;
  for (const ch of s) {
    if (ch === "百") { n += (cur || 1) * 100; cur = 0; }
    else if (ch === "十") { n += (cur || 1) * 10; cur = 0; }
    else cur = KAN_DIG[ch] ?? 0;
  }
  return n + cur;
};
const intToKan = (n) => {
  const D = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  return ((h ? (h > 1 ? D[h] : "") + "百" : "") + (t ? (t > 1 ? D[t] : "") + "十" : "") + D[o]) || "〇";
};
const zenToInt = (s) => parseInt(s.replace(/[０-９]/g, (d) => "０１２３４５６７８９".indexOf(d)), 10);
const intToZen = (n) => String(n).replace(/[0-9]/g, (d) => "０１２３４５６７８９"[+d]);
const NUM = preset === "courts" ? `${KAN}+` : "[０-９0-9]+";
const numToInt = preset === "courts" ? kanToInt : zenToInt;
const numFromInt = preset === "courts" ? intToKan : intToZen;
const delPair = new RegExp(`^第(${NUM})条及び第(${NUM})条[\\s　]*削除(（[^）]*）)?\\s*$`);
const delRange = new RegExp(`^第(${NUM})条から第(${NUM})条まで[\\s　]*削除(（[^）]*）)?\\s*$`);

// ---- 本文範囲の特定 ----
// 最初に条の書き出しにマッチする行（目次の「（第○条－第○条）」はマッチしない）
const firstArt = physical.findIndex((l) => P.article.test(l));
if (firstArt < 0) throw new Error("条の開始行が見つかりません");
// 直前の見出し・章節行まで遡って取り込む（目次行「…（第○条…」に当たったら止める）
let start = firstArt;
while (start > 0) {
  const prev = physical[start - 1];
  const isHead =
    (caption.test(prev) || P.part.test(prev) || P.chapter.test(prev) || P.section.test(prev)) &&
    !/（第[０-９0-9一二三四五六七八九十百]+条/.test(prev);
  if (!isHead) break;
  start--;
}
let end = physical.length;
for (let i = firstArt; i < physical.length; i++) {
  if (P.endBody.test(physical[i])) {
    end = i;
    break;
  }
}
const body = physical.slice(start, end);

// ---- 物理行 → 論理行（PDFの折返しを結合） ----
const isMarker = (l) =>
  P.part.test(l) || P.chapter.test(l) || P.section.test(l) || P.article.test(l) ||
  P.paragraph.test(l) || P.item.test(l) || P.subitem.test(l) || caption.test(l) ||
  delPair.test(l) || delRange.test(l);

let logical = [];
for (const l of body) {
  if (isMarker(l) || logical.length === 0) logical.push(l);
  else logical[logical.length - 1] += l;
}
if (P.postJoin) logical = logical.map(P.postJoin);

// ---- 論理行 → 手動収録形式 ----
const hasPart = logical.some((l) => P.part.test(l));
// 先頭の番号・記号と本文の間だけ全角空白で区切り、残りの空白は除去
const norm = (s) => {
  const t = s.trim().replace(/[\s　]+/g, " ");
  const i = t.indexOf(" ");
  return i < 0 ? t : t.slice(0, i) + "　" + t.slice(i + 1).replace(/ /g, "");
};
const headNorm = (s) => s.replace(/[\s　]+/g, "　").trim();

const out = [];
let pendingCaption = "";
for (const line of logical) {
  if (P.part.test(line)) {
    out.push("＃" + headNorm(line));
    continue;
  }
  if (P.chapter.test(line)) {
    out.push((hasPart ? "＃＃" : "＃") + headNorm(line));
    continue;
  }
  if (P.section.test(line)) {
    out.push("＃＃" + headNorm(line));
    continue;
  }
  if (caption.test(line) && !P.article.test(line)) {
    pendingCaption = line.trim();
    continue;
  }
  // 「第２０条及び第２１条　削除」「第X条から第Y条まで　削除」を個別の削除条に展開
  const mPair = line.match(delPair);
  const mRange = line.match(delRange);
  if (mPair || mRange) {
    const a = numToInt((mPair ?? mRange)[1]);
    const b = numToInt((mPair ?? mRange)[2]);
    const nums = mPair ? [a, b] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
    for (const n of nums) {
      out.push("■第" + numFromInt(n) + "条");
      out.push("削除");
    }
    pendingCaption = "";
    continue;
  }
  const mArt = line.match(P.article);
  if (mArt) {
    out.push("■" + mArt[1] + pendingCaption);
    pendingCaption = "";
    const rest = line.slice(mArt[0].length).trim();
    if (rest) out.push(rest.replace(/[\s　]+/g, ""));
    continue;
  }
  if (P.paragraph.test(line)) {
    out.push(norm(line));
    continue;
  }
  if (P.item.test(line)) {
    // 括弧号「(1)」は括弧ごと番号として扱う
    const m = line.match(P.item);
    const numTok = m[0].trim();
    out.push("　" + numTok + "　" + line.slice(m[0].length).replace(/[\s　]+/g, ""));
    continue;
  }
  if (P.subitem.test(line)) {
    out.push("　　" + norm(line));
    continue;
  }
  out.push(line.replace(/[\s　]+/g, ""));
}

writeFileSync(output, out.join("\n") + "\n");
const arts = out.filter((l) => l.startsWith("■")).length;
console.log(`${output}: 条=${arts} 行=${out.length}（本文範囲 ${start}〜${end}/${physical.length}行）`);
