// data/raw/<lawId>/ の全バージョン + data/manual/<slug>/ の手動収録文書から、
// Webアプリ用の差分データセットを生成する
//   public/data/laws/<lawId>.json        … 法令ごとのデータセット
//   public/data/index.json               … 法令一覧（トップページ用）
//   public/data/attachments/<lawId>/…    … 条文が参照する様式PDF等
//
// データモデル:
//   snapshots: 施行日ごとに集約したバージョン列
//   articles:  条ごとに「内容が変わったスナップショットのみ」本文を保持
//   行(Line) = 項・号・表の行・図。図は f に添付ファイルパス（<law_revision_id>/<basename>）を持つ
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LAWS } from "./laws.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawRoot = join(root, "data", "raw");
const manualRoot = join(root, "data", "manual");
const outDir = join(root, "public", "data");
const lawsOut = join(outDir, "laws");
mkdirSync(lawsOut, { recursive: true });

// ---- 条文ツリー → 行リスト変換 -------------------------------------------

const EMPTY = new Set();

function textOf(node, excludeTags = EMPTY) {
  if (typeof node === "string") return node;
  if (!node || excludeTags.has(node.tag)) return "";
  return (node.children ?? []).map((c) => textOf(c, excludeTags)).join("");
}

const ITEM_TAGS = ["Item", "Subitem1", "Subitem2", "Subitem3"];

// 図: 添付ファイル（様式PDF等）への参照行。attMap: src → law_revision_id
function figLine(node, depth, attMap) {
  const src = node.attr?.src ?? "";
  const base = src.split("/").pop() ?? "fig";
  const revId = attMap?.get(src);
  const line = { i: depth, t: "［様式・図］　" + base };
  if (revId) line.f = `${revId}/${base}`;
  return line;
}

// 表: TableRow を diff の1行として直列化（セルは「｜」区切り）
function emitTable(tableStruct, depth, lines, attMap) {
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.tag === "TableStructTitle") {
      lines.push({ i: depth, t: textOf(n) });
      return;
    }
    if (n.tag === "TableRow" || n.tag === "TableHeaderRow") {
      const cells = (n.children ?? [])
        .filter((c) => c.tag === "TableColumn" || c.tag === "TableHeaderColumn")
        .map((c) => textOf(c));
      lines.push({ i: depth, t: cells.join("｜") });
      // セル内の図は行として続けて出力
      (n.children ?? []).forEach((c) => collectFigs(c, depth, lines, attMap));
      return;
    }
    (n.children ?? []).forEach(walk);
  })(tableStruct);
}

function collectFigs(node, depth, lines, attMap) {
  if (!node || typeof node !== "object") return;
  if (node.tag === "Fig") {
    lines.push(figLine(node, depth, attMap));
    return;
  }
  (node.children ?? []).forEach((c) => collectFigs(c, depth, lines, attMap));
}

// 項・号・表行・図を「diffの1行」として抽出する
function articleLines(article, attMap) {
  const lines = [];
  for (const p of article.children ?? []) {
    if (p.tag !== "Paragraph") continue;
    const num = textOf(p.children?.find((c) => c.tag === "ParagraphNum") ?? "");
    const body = textOf(p, new Set(["ParagraphNum", ...ITEM_TAGS, "TableStruct", "Fig"]));
    lines.push({ i: 0, t: (num ? num + "　" : "") + body });
    collectBlocks(p, 1, lines, attMap);
  }
  return lines;
}

function collectBlocks(node, depth, lines, attMap) {
  for (const c of node.children ?? []) {
    if (typeof c === "string") continue;
    if (ITEM_TAGS.includes(c.tag)) {
      const title = textOf(c.children?.find((x) => x.tag?.endsWith("Title")) ?? "");
      const body = textOf(
        c,
        new Set([c.tag + "Title", ...ITEM_TAGS.filter((t) => t !== c.tag), "TableStruct", "Fig"]),
      );
      const own = body.startsWith(title) ? body.slice(title.length) : body;
      lines.push({ i: depth, t: title + "　" + own.replace(/^　+/, "") });
      collectBlocks(c, depth + 1, lines, attMap);
    } else if (c.tag === "TableStruct") {
      emitTable(c, depth, lines, attMap);
    } else if (c.tag === "Fig") {
      lines.push(figLine(c, depth, attMap));
    } else if (c.tag !== "Paragraph") {
      collectBlocks(c, depth, lines, attMap);
    }
  }
}

// ---- 別表・別記・様式（附属書き）の抽出 ------------------------------------

const APPDX_TAGS = {
  AppdxTable: "別表",
  AppdxNote: "別記",
  AppdxStyle: "様式",
  AppdxFormat: "書式",
};

function hasSpecial(n) {
  if (!n || typeof n !== "object") return false;
  if (n.tag === "TableStruct" || n.tag === "Fig") return true;
  return (n.children ?? []).some(hasSpecial);
}

function emitAppdxContent(node, depth, lines, attMap) {
  for (const c of node.children ?? []) {
    if (typeof c === "string") {
      if (c.trim()) lines.push({ i: depth, t: c });
      continue;
    }
    if (c.tag === "TableStruct") emitTable(c, depth, lines, attMap);
    else if (c.tag === "Fig") lines.push(figLine(c, depth, attMap));
    else if (hasSpecial(c)) emitAppdxContent(c, depth, lines, attMap);
    else {
      const t = textOf(c);
      if (t.trim()) lines.push({ i: depth, t });
    }
  }
}

// 本則から条を文書順に抽出（所属する編・章も記録）。別表・様式等は疑似「条」として抽出
function extractArticles(lawFullText, attMap) {
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
        lines: articleLines(n, attMap),
      });
      return;
    }
    (n.children ?? []).forEach((ch) => walk(ch, c, inMain));
  })(lawFullText, {}, false);

  const seq = { AppdxTable: 0, AppdxNote: 0, AppdxStyle: 0, AppdxFormat: 0 };
  (function walkAppdx(n) {
    if (!n || typeof n !== "object") return;
    if (n.tag === "SupplProvision") return; // 附則の別表等は対象外
    const label = APPDX_TAGS[n.tag];
    if (label) {
      seq[n.tag]++;
      const titleTag = n.tag + "Title";
      const title = textOf(n.children?.find((c) => c.tag === titleTag) ?? "") || `${label}${seq[n.tag]}`;
      const related = textOf(n.children?.find((c) => c.tag === "RelatedArticleNum") ?? "");
      const lines = [];
      emitAppdxContent(
        { children: (n.children ?? []).filter((c) => c.tag !== titleTag && c.tag !== "RelatedArticleNum") },
        0,
        lines,
        attMap,
      );
      out.push({
        key: `appdx:${n.tag}:${n.attr?.Num ?? seq[n.tag]}`,
        title,
        caption: related,
        part: "別表・様式",
        chapter: "",
        lines,
      });
      return;
    }
    (n.children ?? []).forEach(walkAppdx);
  })(lawFullText);

  return out;
}

// ---- 条キーの並び替え ------------------------------------------------------

const isAppdx = (k) => k.startsWith("appdx:");

function sortKey(key) {
  return key.split(":")[0].split("_").map(Number);
}

function cmpKey(a, b) {
  if (isAppdx(a) || isAppdx(b)) {
    if (!isAppdx(a)) return -1; // 別表・様式は末尾
    if (!isAppdx(b)) return 1;
    return a.localeCompare(b, "ja", { numeric: true });
  }
  const ka = sortKey(a), kb = sortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---- スナップショット列 → 条ごとの変更履歴（共通ロジック） -----------------

// 変更判定はクライアント側diff（src/diff.ts の lineKey）と同じ「インデント＋本文」で行う。
// 添付パス f は law_revision_id を含み改正のたびに変わる（e-GovがPDFを再生成する）ため、
// 比較に含めると本文が同一でも全様式が偽の改正イベントになる
const lineText = (ls) => ls.map((l) => l.i + "\t" + l.t).join("\n");

/**
 * snapshotArticleLists: スナップショットごとの条リスト（extractArticles / parseManualText の結果）
 * 返り値: { articles, figRefs }
 */
function buildArticleHistory(snapshotArticleLists) {
  const articleMap = new Map();
  const figRefs = new Set();
  let latestOrder = [];

  snapshotArticleLists.forEach((arts, si) => {
    latestOrder = arts.map((a) => a.key);
    const seen = new Set();
    for (const a of arts) {
      seen.add(a.key);
      let entry = articleMap.get(a.key);
      if (!entry) {
        entry = { changes: [] };
        articleMap.set(a.key, entry);
      }
      entry.part = a.part;
      entry.chapter = a.chapter;
      const prev = entry.changes.at(-1);
      const sig = a.title + " " + a.caption + " " + lineText(a.lines);
      if (!prev || prev.gone || prev.sig !== sig) {
        entry.changes.push({ s: si, title: a.title, caption: a.caption, lines: a.lines, sig });
        // 添付は実際に収録される変更イベントが参照するものだけコピー対象にする
        for (const l of a.lines) if (l.f) figRefs.add(l.f);
      }
    }
    for (const [key, entry] of articleMap) {
      const prev = entry.changes.at(-1);
      if (prev && !prev.gone && !seen.has(key)) entry.changes.push({ s: si, gone: true });
    }
  });

  const orderIndex = new Map(latestOrder.map((k, i) => [k, i]));
  const allKeys = [...articleMap.keys()].sort((a, b) => {
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
  return { articles, figRefs };
}

// 注: どの条からも参照されないスナップショット（改正法の施行はあったが収録範囲の
// 条文に変化がない施行日）もデータに残す。改正マップ側が細い灰色の空列として描く

// ---- e-Gov法令 1件分のデータセット構築 -------------------------------------

function buildLaw(cfg) {
  const dir = join(rawRoot, cfg.id);
  const revList = JSON.parse(readFileSync(join(dir, "revisions.json"), "utf8"));
  const targets = cfg.latestOnly ? [revList.revisions[0]] : revList.revisions;
  const byDate = new Map();
  for (const rev of targets) {
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

  const perSnapshot = snapshots.map((snap) => {
    const data = JSON.parse(readFileSync(join(dir, `${snap.primary.law_revision_id}.json`), "utf8"));
    const attMap = new Map(
      (data.attached_files_info?.attached_files ?? []).map((e) => [e.src, e.law_revision_id]),
    );
    return extractArticles(data.law_full_text, attMap);
  });

  const { articles, figRefs } = buildArticleHistory(perSnapshot);

  return {
    dataset: {
      lawId: cfg.id,
      lawTitle: cfg.name ?? revList.revisions[0].law_title,
      lawNum: revList.law_info?.law_num ?? "",
      category: cfg.category,
      latestOnly: cfg.latestOnly === true,
      generated: new Date().toISOString().slice(0, 10),
      snapshots: snapshots.map(({ date, amendments }) => ({ date, amendments })),
      articles,
    },
    figRefs,
  };
}

// ---- 手動収録文書（e-Gov非収録の裁判所規則・準則） --------------------------
//
// data/manual/<slug>/meta.json  … {"title","num","category","source","sourceNote"}
// data/manual/<slug>/<YYYY-MM-DD>.txt … その日から適用される全文
//   行頭「＃」=編、「＃＃」=章、「■第○条（見出し）」=条の開始、
//   本文行の行頭全角スペース数=インデント（号・イロハ）

function parseManualText(text) {
  const out = [];
  let cur = null;
  let part = "";
  let chapter = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[\s　]+$/, "");
    if (!line.trim()) continue;
    if (line.startsWith("＃＃")) {
      chapter = line.slice(2).trim();
      continue;
    }
    if (line.startsWith("＃")) {
      part = line.slice(1).trim();
      chapter = "";
      continue;
    }
    if (line.startsWith("■")) {
      const head = line.slice(1).trim();
      const m = head.match(/^(第[^（\s]+)\s*(（.+）)?$/);
      cur = {
        key: m ? m[1] : head,
        title: m ? m[1] : head,
        caption: m?.[2] ?? "",
        part,
        chapter,
        lines: [],
      };
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { key: "前文", title: "前文", caption: "", part, chapter, lines: [] };
      out.push(cur);
    }
    const indent = line.match(/^　+/)?.[0].length ?? 0;
    cur.lines.push({ i: Math.min(indent, 3), t: line.replace(/^　+/, "") });
  }
  return out;
}

function buildManual(slug) {
  const dir = join(manualRoot, slug);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const versionFiles = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .sort();
  if (versionFiles.length === 0) return null; // 本文未投入はスキップ
  const snapshots = versionFiles.map((f) => ({ date: f.slice(0, 10), amendments: [] }));
  const perSnapshot = versionFiles.map((f) => parseManualText(readFileSync(join(dir, f), "utf8")));
  const { articles } = buildArticleHistory(perSnapshot);
  return {
    lawId: "m-" + slug,
    lawTitle: meta.title,
    lawNum: meta.num ?? "",
    category: meta.category ?? "規則・準則（手動収録）",
    latestOnly: versionFiles.length === 1,
    manual: true,
    source: meta.source ?? "",
    sourceNote: meta.sourceNote ?? "",
    generated: new Date().toISOString().slice(0, 10),
    snapshots,
    articles,
  };
}

// ---- 全体ループ ------------------------------------------------------------

if (existsSync(join(outDir, "minpo.json"))) rmSync(join(outDir, "minpo.json"));
// 参照されなくなった添付（旧版の様式PDF等）を残さないよう作り直す
rmSync(join(outDir, "attachments"), { recursive: true, force: true });

const index = [];
let totalBytes = 0;
let errors = 0;
let copiedAtt = 0;

function pushIndex(ds, bytes) {
  totalBytes += bytes;
  const changed = ds.articles.filter((a) => a.changes.length > 1 || (a.changes[0]?.s ?? 0) > 0).length;
  index.push({
    id: ds.lawId,
    title: ds.lawTitle,
    num: ds.lawNum,
    category: ds.category,
    latestOnly: ds.latestOnly,
    manual: ds.manual === true,
    snapshots: ds.snapshots.length,
    articles: ds.articles.length,
    changed,
  });
  console.log(`${ds.lawTitle}: ${ds.snapshots.length}版 / ${ds.articles.length}条 ${(bytes / 1024).toFixed(0)}KB`);
}

for (const cfg of LAWS) {
  try {
    const { dataset, figRefs } = buildLaw(cfg);
    const file = join(lawsOut, `${cfg.id}.json`);
    writeFileSync(file, JSON.stringify(dataset));
    pushIndex(dataset, readFileSync(file).length);
    // 参照される添付ファイルを公開ディレクトリへコピー
    for (const ref of figRefs) {
      const src = join(rawRoot, cfg.id, "attachments", ref);
      const dest = join(outDir, "attachments", cfg.id, ref);
      if (!existsSync(src)) {
        console.warn(`  添付なし: ${cfg.id}/${ref}（fetch-data を再実行してください）`);
        continue;
      }
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      copiedAtt++;
    }
  } catch (e) {
    errors++;
    console.error(`ERROR ${cfg.id}: ${e.message}`);
  }
}

if (existsSync(manualRoot)) {
  for (const slug of readdirSync(manualRoot)) {
    if (!existsSync(join(manualRoot, slug, "meta.json"))) continue; // README等はスキップ
    try {
      const ds = buildManual(slug);
      if (!ds) {
        console.log(`（手動収録 ${slug}: 本文未投入のためスキップ）`);
        continue;
      }
      const file = join(lawsOut, `${ds.lawId}.json`);
      writeFileSync(file, JSON.stringify(ds));
      pushIndex(ds, readFileSync(file).length);
    } catch (e) {
      errors++;
      console.error(`ERROR manual/${slug}: ${e.message}`);
    }
  }
}

writeFileSync(
  join(outDir, "index.json"),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), laws: index }),
);
console.log(`---`);
console.log(
  `laws: ${index.length}  errors: ${errors}  attachments: ${copiedAtt}  total: ${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
);
