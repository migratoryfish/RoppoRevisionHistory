// data/raw/ の全バージョンから、Webアプリ用の差分データセット public/data/minpo.json を生成する
//
// データモデル:
//   snapshots: 施行日ごとに集約したバージョン列（同日に複数の改正法が施行される場合は1つに統合）
//   articles:  条ごとに「内容が変わったスナップショットのみ」本文を保持（Gitのスナップショット方式に相当）
//   diff計算はクライアント側で行う
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "data", "raw");
const outDir = join(root, "public", "data");
mkdirSync(outDir, { recursive: true });

// ---- 条文ツリー → 行リスト変換 -------------------------------------------

// ノード以下のテキストを、構造タグ（Item等）を除外しつつ平坦化する
function textOf(node, excludeTags = new Set()) {
  if (typeof node === "string") return node;
  if (!node || excludeTags.has(node.tag)) return "";
  return (node.children ?? []).map((c) => textOf(c, excludeTags)).join("");
}

const ITEM_TAGS = ["Item", "Subitem1", "Subitem2", "Subitem3"];

// 項・号を「diffの1行」として抽出する
function articleLines(article) {
  const lines = [];
  for (const p of article.children ?? []) {
    if (p.tag !== "Paragraph") continue;
    const num = textOf(p.children?.find((c) => c.tag === "ParagraphNum") ?? "");
    const body = textOf(p, new Set(["ParagraphNum", ...ITEM_TAGS]));
    lines.push({ i: 0, t: (num ? num + "　" : "") + body });
    collectItems(p, 1, lines);
  }
  return lines;
}

function collectItems(node, depth, lines) {
  for (const c of node.children ?? []) {
    if (typeof c === "string") continue;
    if (ITEM_TAGS.includes(c.tag)) {
      const title = textOf(c.children?.find((x) => x.tag?.endsWith("Title")) ?? "");
      const body = textOf(c, new Set([c.tag + "Title", ...ITEM_TAGS.filter((t) => t !== c.tag)]));
      const own = body.startsWith(title) ? body.slice(title.length) : body;
      lines.push({ i: depth, t: title + "　" + own.replace(/^　+/, "") });
      collectItems(c, depth + 1, lines);
    } else if (c.tag !== "Paragraph") {
      collectItems(c, depth, lines);
    }
  }
}

// 本則から条を文書順に抽出（所属する編・章も記録する）
function extractArticles(lawFullText) {
  const out = [];
  (function walk(n, ctx, inMain) {
    if (!n || typeof n !== "object") return;
    if (n.tag === "SupplProvision") return;
    if (n.tag === "MainProvision") inMain = true;
    let c = ctx;
    if (n.tag === "Part") c = { ...ctx, part: textOf(n.children?.find((x) => x.tag === "PartTitle") ?? "") };
    if (n.tag === "Chapter") c = { ...c, chapter: textOf(n.children?.find((x) => x.tag === "ChapterTitle") ?? "") };
    if (inMain && n.tag === "Article") {
      out.push({
        key: n.attr?.Num ?? "?",
        title: textOf(n.children?.find((x) => x.tag === "ArticleTitle") ?? ""),
        caption: textOf(n.children?.find((x) => x.tag === "ArticleCaption") ?? ""),
        part: c.part ?? "",
        chapter: c.chapter ?? "",
        lines: articleLines(n),
      });
      return;
    }
    (n.children ?? []).forEach((ch) => walk(ch, c, inMain));
  })(lawFullText, {}, false);
  return out;
}

// "404_2" → [404,2] / "38:84" → [38] （並び替え用）
function sortKey(key) {
  return key.split(":")[0].split("_").map(Number);
}
function cmpKey(a, b) {
  const ka = sortKey(a), kb = sortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---- スナップショット構築 -------------------------------------------------

const revList = JSON.parse(readFileSync(join(rawDir, "revisions.json"), "utf8"));
// APIは新しい順で返す。同一施行日で複数エントリある場合、最初に現れるものが最終状態
const byDate = new Map();
for (const rev of revList.revisions) {
  const d = rev.amendment_enforcement_date;
  if (!byDate.has(d)) byDate.set(d, { date: d, primary: rev, amendments: [] });
  byDate.get(d).amendments.push({
    lawNum: rev.amendment_law_num,
    lawTitle: rev.amendment_law_title,
    promulgated: rev.amendment_promulgate_date,
    comment: rev.amendment_enforcement_comment,
  });
}
const snapshots = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

// ---- 条ごとの変更履歴 ------------------------------------------------------

const articleMap = new Map(); // key → { changes: [{s, title, caption, lines} | {s, gone:true}] }
const lineText = (ls) => ls.map((l) => l.i + "\t" + l.t).join("\n");

snapshots.forEach((snap, si) => {
  const file = join(rawDir, `${snap.primary.law_revision_id}.json`);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const arts = extractArticles(data.law_full_text);
  snap.articleOrder = arts.map((a) => a.key);
  const seen = new Set();
  for (const a of arts) {
    seen.add(a.key);
    let entry = articleMap.get(a.key);
    if (!entry) {
      entry = { changes: [] };
      articleMap.set(a.key, entry);
    }
    entry.part = a.part; // 最後に出現したバージョンの編・章を採用
    entry.chapter = a.chapter;
    const prev = entry.changes.at(-1);
    const sig = a.title + "" + a.caption + "" + lineText(a.lines);
    if (!prev || prev.gone || prev.sig !== sig) {
      entry.changes.push({ s: si, title: a.title, caption: a.caption, lines: a.lines, sig });
    }
  }
  // 前スナップショットに存在して今回消えた条
  for (const [key, entry] of articleMap) {
    const prev = entry.changes.at(-1);
    if (prev && !prev.gone && !seen.has(key)) entry.changes.push({ s: si, gone: true });
  }
});

// 表示順: 最新スナップショットの文書順 + 消えた条は番号順で挿入
const latestOrder = snapshots.at(-1).articleOrder;
const allKeys = [...articleMap.keys()];
const orderIndex = new Map(latestOrder.map((k, i) => [k, i]));
allKeys.sort((a, b) => {
  const ia = orderIndex.get(a), ib = orderIndex.get(b);
  if (ia != null && ib != null) return ia - ib;
  return cmpKey(a, b);
});

const articles = allKeys.map((key) => {
  const e = articleMap.get(key);
  return {
    key,
    part: e.part ?? "",
    chapter: e.chapter ?? "",
    changes: e.changes.map(({ sig, ...rest }) => rest),
  };
});

const dataset = {
  lawTitle: revList.law_info?.law_title ?? "民法",
  lawNum: revList.law_info?.law_num ?? "明治二十九年法律第八十九号",
  generated: new Date().toISOString().slice(0, 10),
  snapshots: snapshots.map(({ date, amendments }) => ({ date, amendments })),
  articles,
};

const outFile = join(outDir, "minpo.json");
writeFileSync(outFile, JSON.stringify(dataset));

// ---- 統計 ------------------------------------------------------------------
const changed = articles.filter((a) => a.changes.length > 1).length;
const bytes = readFileSync(outFile).length;
console.log(`snapshots: ${snapshots.length}`);
console.log(`articles: ${articles.length}（うち期間内に変更あり: ${changed}）`);
console.log(`output: ${(bytes / 1024 / 1024).toFixed(2)} MB → ${outFile}`);
