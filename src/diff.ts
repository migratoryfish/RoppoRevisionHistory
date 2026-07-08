import { diffArrays, diffChars } from "diff";
import type { Change, Line } from "./types";

export interface Seg {
  text: string;
  hl: boolean;
}

export interface DiffRow {
  kind: "ctx" | "del" | "add";
  oldNo: number | null;
  newNo: number | null;
  indent: number;
  segs: Seg[];
}

// 行の同一性はインデント＋本文の完全一致で判定する
const lineKey = (l: Line) => l.i + "\t" + l.t;
const unkey = (k: string) => {
  const tab = k.indexOf("\t");
  return { indent: Number(k.slice(0, tab)), text: k.slice(tab + 1) };
};

/** GitHub風の行diff。置換ブロック内は行を index で対にして文字レベルのインライン差分を計算する */
export function diffLineSets(oldLines: Line[], newLines: Line[]): DiffRow[] {
  const parts = diffArrays(oldLines.map(lineKey), newLines.map(lineKey));
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    if (part.removed) {
      const next = parts[p + 1];
      const addVals = next?.added ? next.value : [];
      const delSegs: Seg[][] = [];
      const addSegs: Seg[][] = [];
      part.value.forEach((dv, i) => {
        if (i < addVals.length) {
          const { del, add } = inlineSegs(unkey(dv).text, unkey(addVals[i]).text);
          delSegs.push(del);
          addSegs.push(add);
        } else {
          delSegs.push([{ text: unkey(dv).text, hl: false }]);
        }
      });
      for (let i = part.value.length; i < addVals.length; i++) {
        addSegs.push([{ text: unkey(addVals[i]).text, hl: false }]);
      }
      part.value.forEach((dv, i) =>
        rows.push({ kind: "del", oldNo: ++oldNo, newNo: null, indent: unkey(dv).indent, segs: delSegs[i] }),
      );
      addVals.forEach((av, i) =>
        rows.push({ kind: "add", oldNo: null, newNo: ++newNo, indent: unkey(av).indent, segs: addSegs[i] }),
      );
      if (next?.added) p++;
    } else if (part.added) {
      part.value.forEach((av) =>
        rows.push({
          kind: "add",
          oldNo: null,
          newNo: ++newNo,
          indent: unkey(av).indent,
          segs: [{ text: unkey(av).text, hl: false }],
        }),
      );
    } else {
      part.value.forEach((v) =>
        rows.push({
          kind: "ctx",
          oldNo: ++oldNo,
          newNo: ++newNo,
          indent: unkey(v).indent,
          segs: [{ text: unkey(v).text, hl: false }],
        }),
      );
    }
  }
  return rows;
}

/** 2つの文字列の文字レベル差分（本文の置換行のほか、見出しの変更表示にも使う） */
export function inlineSegs(oldT: string, newT: string): { del: Seg[]; add: Seg[] } {
  const parts = diffChars(oldT, newT);
  const del: Seg[] = [];
  const add: Seg[] = [];
  for (const p of parts) {
    if (p.added) add.push({ text: p.value, hl: true });
    else if (p.removed) del.push({ text: p.value, hl: true });
    else {
      del.push({ text: p.value, hl: false });
      add.push({ text: p.value, hl: false });
    }
  }
  return { del, add };
}

/** 新旧対照表（左右分割）用: 削除行と追加行を対にして並べる */
export interface SplitRow {
  left: DiffRow | null;
  right: DiffRow | null;
}

export function toSplitRows(rows: DiffRow[]): SplitRow[] {
  const out: SplitRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind === "ctx") {
      out.push({ left: rows[i], right: rows[i] });
      i++;
      continue;
    }
    const dels: DiffRow[] = [];
    const adds: DiffRow[] = [];
    while (i < rows.length && rows[i].kind === "del") dels.push(rows[i++]);
    while (i < rows.length && rows[i].kind === "add") adds.push(rows[i++]);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) out.push({ left: dels[k] ?? null, right: adds[k] ?? null });
  }
  return out;
}

/**
 * 由来（git blame 相当）: changes[upTo] の各行が、どの変更（changes のインデックス）で
 * 導入されたかを返す。
 */
export function blameLines(changes: Change[], upTo: number): number[] {
  let attr: number[] = [];
  let prevLines: Line[] | null = null;
  for (let ci = 0; ci <= upTo; ci++) {
    const c = changes[ci];
    if (c.gone || !c.lines) continue;
    if (prevLines === null) {
      attr = c.lines.map(() => ci);
      prevLines = c.lines;
      continue;
    }
    const parts = diffArrays(prevLines.map(lineKey), c.lines.map(lineKey));
    const next: number[] = [];
    let oldPos = 0;
    for (const p of parts) {
      if (p.added) p.value.forEach(() => next.push(ci));
      else if (p.removed) oldPos += p.value.length;
      else p.value.forEach(() => next.push(attr[oldPos++]));
    }
    attr = next;
    prevLines = c.lines;
  }
  return attr;
}
