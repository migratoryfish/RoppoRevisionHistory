import { useEffect, useMemo, useRef, useState } from "react";
import { displayTitle, isGoneNow, latestState, realChangeCount } from "../data";
import type { Article, Dataset } from "../types";

interface Props {
  data: Dataset;
  activeKey: string | null;
  onPick: (key: string) => void;
}

export default function Sidebar({ data, activeKey, onPick }: Props) {
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // 改正マップの一覧などから遷移したとき、選択中の条が一覧の画面外なら中央付近まで
  // スクロールする。scrollIntoView はページ全体も動かしてしまうため scrollTop を直接操作する
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(".art-item.active");
    if (!list || !el) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < lr.top || er.bottom > lr.bottom) {
      list.scrollTop += er.top - lr.top - (lr.height - er.height) / 2;
    }
  }, [activeKey]);

  const filtered = useMemo(() => {
    const query = q.trim();
    if (!query) return data.articles;
    return data.articles.filter((a) => {
      const st = latestState(a);
      return (
        a.key.includes(query) ||
        (st.title ?? "").includes(query) ||
        (st.caption ?? "").includes(query) ||
        a.chapter.includes(query)
      );
    });
  }, [data, q]);

  let prevGroup = "";

  return (
    <aside className="sidebar">
      <input
        type="search"
        placeholder="条番号・見出しで検索（例: 404 / 利率）"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="art-list" ref={listRef}>
        {filtered.map((a) => {
          const group = a.part + "｜" + a.chapter;
          const header = group !== prevGroup ? <div key={"g" + a.key} className="group-head">{group}</div> : null;
          prevGroup = group;
          const n = realChangeCount(a);
          return [
            header,
            <button
              key={a.key}
              className={"art-item" + (a.key === activeKey ? " active" : "") + (isGoneNow(a) ? " gone" : "")}
              onClick={() => onPick(a.key)}
            >
              <span className="art-title">{displayTitle(a)}</span>
              {latestState(a).caption && <span className="art-caption">{latestState(a).caption}</span>}
              {n > 0 && <span className="count-badge" title={`${n}回の変更`}>{n}</span>}
              {isGoneNow(a) && <span className="gone-badge">消滅</span>}
            </button>,
          ];
        })}
      </div>
    </aside>
  );
}
