import type { Article, Change, ChangeType, Dataset } from "./types";

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch(import.meta.env.BASE_URL + "data/minpo.json");
  if (!res.ok) throw new Error(`データセットの読み込みに失敗しました (${res.status})`);
  return res.json();
}

export const todayStr = () => new Date().toISOString().slice(0, 10);

/** changes[idx] の変更種別。基準スナップショット（idx=0 かつ s=0）は変更ではない */
export function changeType(article: Article, idx: number): ChangeType {
  const c = article.changes[idx];
  if (c.gone) return "del";
  if (idx === 0) return "add"; // 収録開始後に新設された条
  if (article.changes[idx - 1].gone) return "add"; // 復活
  return "mod";
}

/** 基準スナップショット時点の収録を除いた、実際の改正イベント数 */
export function realChangeCount(article: Article): number {
  return article.changes.filter((c, i) => !(i === 0 && c.s === 0)).length;
}

/** 最後に存在した時点の内容（消滅した条は消滅直前の内容） */
export function latestState(article: Article): Change {
  for (let i = article.changes.length - 1; i >= 0; i--) {
    if (!article.changes[i].gone) return article.changes[i];
  }
  return article.changes[0];
}

export function isGoneNow(article: Article): boolean {
  return article.changes.at(-1)?.gone === true;
}

export function displayTitle(article: Article): string {
  return latestState(article).title || `第${article.key}条`;
}

/** 既定で表示するバージョン: 施行済みの最新（なければ最初） */
export function defaultChangeIdx(article: Article, dataset: Dataset): number {
  const today = todayStr();
  let idx = 0;
  article.changes.forEach((c, i) => {
    if (dataset.snapshots[c.s].date <= today) idx = i;
  });
  return idx;
}

export const TYPE_LABEL: Record<ChangeType, string> = {
  add: "追加",
  mod: "改正",
  del: "削除",
};
