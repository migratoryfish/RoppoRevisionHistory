// e-Gov 法令API v2 から民法の全改正バージョンをダウンロードして data/raw/ にキャッシュする
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://laws.e-gov.go.jp/api/2";
const LAW_ID = "129AC0000000089"; // 民法（明治二十九年法律第八十九号）

const rawDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "raw");
mkdirSync(rawDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const revList = await getJson(`${API}/law_revisions/${LAW_ID}`);
writeFileSync(join(rawDir, "revisions.json"), JSON.stringify(revList, null, 1));
console.log(`revisions: ${revList.revisions.length}`);

for (const rev of revList.revisions) {
  const file = join(rawDir, `${rev.law_revision_id}.json`);
  if (existsSync(file)) {
    console.log(`skip  ${rev.law_revision_id}`);
    continue;
  }
  const data = await getJson(`${API}/law_data/${rev.law_revision_id}`);
  writeFileSync(file, JSON.stringify(data));
  console.log(`fetch ${rev.law_revision_id} (施行 ${rev.amendment_enforcement_date})`);
  await sleep(500); // APIへの負荷配慮
}
console.log("done");
