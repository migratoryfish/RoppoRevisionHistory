// e-Gov 法令API v2 から対象法令の全改正バージョンをダウンロードして data/raw/<lawId>/ にキャッシュする
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
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
    if (existsSync(file)) {
      skipped++;
      continue;
    }
    const data = await getJson(`${API}/law_data/${rev.law_revision_id}`);
    writeFileSync(file, JSON.stringify(data));
    fetched++;
    process.stdout.write(".");
    await sleep(300); // APIへの負荷配慮
  }
  console.log(" ok");
  await sleep(300);
}
console.log(`done: fetched=${fetched} skipped=${skipped}`);
