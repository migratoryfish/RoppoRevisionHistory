// e-Gov 法令API v2 から対象法令の全改正バージョンをダウンロードして data/raw/<lawId>/ にキャッシュする
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LAWS } from "./laws.mjs";

const API = "https://laws.e-gov.go.jp/api/2";
const rawRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "raw");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw new Error(`${e} : ${url}`);
      await sleep(2000);
    }
  }
}

let fetched = 0;
let skipped = 0;
let attachments = 0;

// 添付ファイル（様式PDF等）を data/raw/<lawId>/attachments/<law_revision_id>/<basename> に保存
async function fetchAttachments(lawDir, data) {
  const files = data.attached_files_info?.attached_files ?? [];
  for (const f of files) {
    const base = f.src.split("/").pop();
    const dest = join(lawDir, "attachments", f.law_revision_id, base);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    const url = `${API}/attachment/${f.law_revision_id}?src=${encodeURIComponent(f.src)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`\n  添付取得失敗 ${res.status}: ${f.law_revision_id} ${f.src}`);
      continue;
    }
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    attachments++;
    process.stdout.write("a");
    await sleep(300);
  }
}

for (const law of LAWS) {
  const dir = join(rawRoot, law.id);
  mkdirSync(dir, { recursive: true });
  const revList = await getJson(`${API}/law_revisions/${law.id}`);
  writeFileSync(join(dir, "revisions.json"), JSON.stringify(revList, null, 1));
  const targets = law.latestOnly ? [revList.revisions[0]] : revList.revisions;
  const title = revList.revisions[0].law_title;
  process.stdout.write(`${title} (${targets.length}版${law.latestOnly ? "・現行のみ" : ""}): `);
  for (const rev of targets) {
    const file = join(dir, `${rev.law_revision_id}.json`);
    let data;
    if (existsSync(file)) {
      skipped++;
      const text = readFileSync(file, "utf8");
      if (!text.includes('"attached_files":[{')) continue; // 添付なし
      data = JSON.parse(text);
    } else {
      data = await getJson(`${API}/law_data/${rev.law_revision_id}`);
      writeFileSync(file, JSON.stringify(data));
      fetched++;
      process.stdout.write(".");
      await sleep(300); // APIへの負荷配慮
    }
    await fetchAttachments(dir, data);
  }
  console.log(" ok");
  await sleep(300);
}
console.log(`done: fetched=${fetched} skipped=${skipped} attachments=${attachments}`);
