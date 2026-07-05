import { useMemo, useState } from "react";
import { TYPE_LABEL, changeType, displayTitle, todayStr } from "../data";
import type { ChangeType, Dataset } from "../types";

interface CellEntry {
  key: string;
  changeIdx: number;
  type: ChangeType;
}

interface Props {
  data: Dataset;
  onOpenArticle: (key: string, changeIdx: number) => void;
}

/** 機能2-A: 章 × 施行日の改正ヒートマップ（セル色 = 変更された条の数） */
export default function HeatmapView({ data, onOpenArticle }: Props) {
  const today = todayStr();
  // 列 = 基準スナップショットを除く施行日
  const cols = useMemo(
    () => data.snapshots.map((snap, s) => ({ snap, s })).slice(1),
    [data],
  );

  const { rows, cells } = useMemo(() => {
    const rowIndex = new Map<string, number>();
    const rows: { part: string; chapter: string }[] = [];
    for (const a of data.articles) {
      const rk = a.part + "|" + a.chapter;
      if (!rowIndex.has(rk)) {
        rowIndex.set(rk, rows.length);
        rows.push({ part: a.part, chapter: a.chapter });
      }
    }
    // cells[rowIdx][s] = 変更された条のリスト
    const cells = new Map<number, Map<number, CellEntry[]>>();
    for (const a of data.articles) {
      const ri = rowIndex.get(a.part + "|" + a.chapter)!;
      a.changes.forEach((c, idx) => {
        if (idx === 0 && c.s === 0) return; // 基準時点は変更ではない
        let byS = cells.get(ri);
        if (!byS) cells.set(ri, (byS = new Map()));
        let list = byS.get(c.s);
        if (!list) byS.set(c.s, (list = []));
        list.push({ key: a.key, changeIdx: idx, type: changeType(a, idx) });
      });
    }
    return { rows, cells };
  }, [data]);

  const [selected, setSelected] = useState<{ ri: number; s: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const heatClass = (n: number) =>
    n === 0 ? "" : n === 1 ? "h1" : n === 2 ? "h2" : n <= 4 ? "h3" : n <= 8 ? "h4" : n <= 16 ? "h5" : n <= 32 ? "h6" : "h7";

  const selEntries = selected ? (cells.get(selected.ri)?.get(selected.s) ?? []) : [];
  const selSnap = selected ? data.snapshots[selected.s] : null;

  let prevPart = "";

  return (
    <div className="heatmap-view">
      <p className="hint">
        セルの色が濃いほど、その施行日にその章で多くの条文が変更されています。セルをクリックすると変更された条の一覧が表示されます。
      </p>
      <div className="hm-scroll">
        <div
          className="hm-grid"
          style={{ gridTemplateColumns: `minmax(230px, max-content) repeat(${cols.length}, 20px)` }}
        >
          <div className="hm-corner" />
          {cols.map(({ snap, s }) => (
            <div key={s} className={"hm-date" + (snap.date > today ? " future" : "")} title={snap.date + (snap.date > today ? "（未施行・施行予定）" : "")}>
              {snap.date}
            </div>
          ))}
          {rows.map((row, ri) => {
            const partHeader =
              row.part !== prevPart ? <div key={"p" + ri} className="hm-part">{row.part || "（前置き）"}</div> : null;
            prevPart = row.part;
            return [
              partHeader,
              <div key={"l" + ri} className="hm-label" title={row.part + " " + row.chapter}>
                {row.chapter || "―"}
              </div>,
              ...cols.map(({ snap, s }) => {
                const list = cells.get(ri)?.get(s) ?? [];
                const n = list.length;
                const isSel = selected?.ri === ri && selected?.s === s;
                return (
                  <button
                    key={ri + "-" + s}
                    className={
                      "hm-cell " + heatClass(n) + (snap.date > today ? " future" : "") + (isSel ? " sel" : "")
                    }
                    disabled={n === 0}
                    onClick={() => setSelected(isSel ? null : { ri, s })}
                    onMouseEnter={(e) => {
                      if (n === 0) return;
                      const t: Record<ChangeType, number> = { add: 0, mod: 0, del: 0 };
                      list.forEach((x) => t[x.type]++);
                      setTip({
                        x: e.clientX,
                        y: e.clientY,
                        text: `${row.chapter}｜${snap.date}\n${n}か条が変更（追加${t.add}・改正${t.mod}・削除${t.del}）`,
                      });
                    }}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              }),
            ];
          })}
        </div>
      </div>

      <div className="hm-legend">
        <span className="legend-title">変更された条の数:</span>
        {[
          ["h1", "1"],
          ["h2", "2"],
          ["h3", "3–4"],
          ["h4", "5–8"],
          ["h5", "9–16"],
          ["h6", "17–32"],
          ["h7", "33+"],
        ].map(([cls, label]) => (
          <span key={cls} className="legend-item">
            <i className={"legend-swatch " + cls} />
            {label}
          </span>
        ))}
        <span className="legend-item">
          <i className="legend-swatch future-sw" />
          破線 = 未施行（施行予定）
        </span>
      </div>

      {selected && selSnap && (
        <section className="hm-detail">
          <h3>
            {rows[selected.ri].part} {rows[selected.ri].chapter}｜{selSnap.date} 施行
            {selSnap.date > today && <span className="badge future-badge">未施行</span>}
          </h3>
          <ul className="amendments">
            {selSnap.amendments.map((am, i) => (
              <li key={i}>
                {am.lawTitle ?? "改正法"}（{am.lawNum}）｜公布 {am.promulgated}
              </li>
            ))}
          </ul>
          <div className="chips">
            {selEntries.map((e) => {
              const art = data.articles.find((a) => a.key === e.key)!;
              return (
                <button key={e.key} className={"chip " + e.type} onClick={() => onOpenArticle(e.key, e.changeIdx)}>
                  <span className={"type-badge " + e.type}>{TYPE_LABEL[e.type]}</span>
                  {displayTitle(art)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {tip && (
        <div className="tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
