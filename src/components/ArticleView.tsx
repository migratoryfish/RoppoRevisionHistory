import { useMemo, useState } from "react";
import { TYPE_LABEL, changeType, displayTitle, todayStr } from "../data";
import { blameLines, diffLineSets } from "../diff";
import type { Article, Dataset, Line } from "../types";
import DiffView from "./DiffView";
import { FigEmbed, LineText } from "./LineContent";
import Timeline from "./Timeline";

interface Props {
  data: Dataset;
  article: Article;
  changeIdx: number;
  onSelectChange: (idx: number) => void;
  onOpenArticle: (key: string, changeIdx: number) => void;
}

export default function ArticleView({ data, article, changeIdx, onSelectChange, onOpenArticle }: Props) {
  const [tab, setTab] = useState<"diff" | "blame">("diff");
  const [diffMode, setDiffMode] = useState<"unified" | "split">("split");
  const today = todayStr();

  const change = article.changes[changeIdx];
  const snap = data.snapshots[change.s];
  const isBase = changeIdx === 0 && change.s === 0;
  const type = isBase ? null : changeType(article, changeIdx);

  // 直前の存在バージョン（diffの比較元）
  const prevLines: Line[] = useMemo(() => {
    for (let i = changeIdx - 1; i >= 0; i--) {
      const c = article.changes[i];
      if (!c.gone && c.lines) return c.lines;
    }
    return [];
  }, [article, changeIdx]);

  const curLines: Line[] = change.gone ? [] : (change.lines ?? []);
  const diffRows = useMemo(() => diffLineSets(prevLines, curLines), [prevLines, curLines]);

  // 様式・図の添付ファイル参照（行テキスト → 添付パス）
  const figBase = `${import.meta.env.BASE_URL}data/attachments/${data.lawId}/`;
  const figMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of [...prevLines, ...curLines]) if (l.f) m.set(l.t, l.f);
    return m;
  }, [prevLines, curLines]);

  const blame = useMemo(
    () => (change.gone ? [] : blameLines(article.changes, changeIdx)),
    [article, changeIdx, change.gone],
  );

  // 消滅イベント時: 同じ施行日に新設された条 = 移動先の候補
  const bornSameDay = useMemo(() => {
    if (!change.gone) return [];
    return data.articles.filter((a) => a.changes[0].s === change.s && changeType(a, 0) === "add");
  }, [data, change]);

  const state = change.gone ? null : change;
  const title = state?.title ?? displayTitle(article);
  const future = snap.date > today;

  return (
    <div className="article-view">
      <header className="art-head">
        <div className="crumb">
          {article.part}
          {article.chapter ? " › " + article.chapter : ""}
        </div>
        <h2>
          {title}
          {state?.caption && <span className="caption">{state.caption}</span>}
        </h2>
        {data.manual && (
          <p className="hint manual-note">
            手動収録データ｜出典:{" "}
            <a href={data.source} target="_blank" rel="noreferrer">
              {data.source}
            </a>
            {data.sourceNote && <>｜{data.sourceNote}</>}
          </p>
        )}
      </header>

      <Timeline data={data} article={article} selectedIdx={changeIdx} onSelect={onSelectChange} />

      <section className="version-card">
        <div className="version-nav">
          <button disabled={changeIdx === 0} onClick={() => onSelectChange(changeIdx - 1)}>
            ← 前の版
          </button>
          <div className="version-title">
            {snap.date} {data.manual ? "適用" : "施行"}
            {future && <span className="badge future-badge">未施行</span>}
            {isBase && <span className="badge base-badge">収録開始時点（差分の起点）</span>}
            {type && <span className={"type-badge " + type}>{TYPE_LABEL[type]}</span>}
          </div>
          <button disabled={changeIdx === article.changes.length - 1} onClick={() => onSelectChange(changeIdx + 1)}>
            次の版 →
          </button>
        </div>
        {!isBase && snap.amendments.length > 0 && (
          <ul className="amendments">
            {snap.amendments.map((am, i) => (
              <li key={i}>
                {am.lawTitle ?? "改正法"}（{am.lawNum}）｜公布 {am.promulgated}
                {am.comment && <span className="comment">｜施行: {am.comment}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {change.gone ? (
        <section className="gone-notice">
          <p>
            この施行日に<strong>{displayTitle(article)}は条として消滅</strong>しました（削除・繰り下げ・再編など）。
          </p>
          {bornSameDay.length > 0 && (
            <p className="gone-candidates">
              同日に新設された条（移動先の可能性）:
              {bornSameDay.map((a) => (
                <button key={a.key} className="chip add" onClick={() => onOpenArticle(a.key, 0)}>
                  {displayTitle(a)}
                </button>
              ))}
            </p>
          )}
          <DiffView rows={diffRows} figBase={figBase} figMap={figMap} />
        </section>
      ) : (
        <>
          <div className="tabs">
            <button className={tab === "diff" ? "active" : ""} onClick={() => setTab("diff")}>
              差分（前の版と比較）
            </button>
            <button className={tab === "blame" ? "active" : ""} onClick={() => setTab("blame")}>
              全文＋由来
            </button>
            {tab === "diff" && !isBase && (
              <span className="mode-toggle">
                <button className={diffMode === "unified" ? "active" : ""} onClick={() => setDiffMode("unified")}>
                  統合
                </button>
                <button className={diffMode === "split" ? "active" : ""} onClick={() => setDiffMode("split")}>
                  新旧対照
                </button>
              </span>
            )}
          </div>
          {tab === "diff" ? (
            isBase ? (
              <>
                <p className="hint">
                  {data.manual
                    ? `${snap.date} 時点として収録した全文です。`
                    : data.latestOnly
                      ? "この法令は現行版のみ収録しています（改正履歴・差分は収録対象外）。"
                      : `e-Gov収録開始時点（${snap.date}）の全文です。これより前の改正はデータソースの範囲外です。`}
                </p>
                <PlainText lines={curLines} figBase={figBase} />
              </>
            ) : (
              <DiffView rows={diffRows} mode={diffMode} figBase={figBase} figMap={figMap} />
            )
          ) : (
            <BlameView
              data={data}
              article={article}
              lines={curLines}
              blame={blame}
              figBase={figBase}
              onJump={(ci) => {
                onSelectChange(ci);
                setTab("diff");
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 全文表示: 連続する表行は実HTMLテーブルとして描画する */
function PlainText({ lines, figBase }: { lines: Line[]; figBase?: string }) {
  const blocks: (Line | Line[])[] = [];
  for (const l of lines) {
    const isTableRow = l.t.includes("｜") && !l.f;
    const last = blocks[blocks.length - 1];
    if (isTableRow && Array.isArray(last)) last.push(l);
    else if (isTableRow) blocks.push([l]);
    else blocks.push(l);
  }
  return (
    <div className="plain-text">
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <div key={i} className="law-table-wrap">
            <table className="law-table">
              <tbody>
                {b.map((row, ri) => (
                  <tr key={ri}>
                    {row.t.split("｜").map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : b.f && figBase ? (
          <div key={i} className="fig-block" style={{ paddingLeft: `${b.i * 1.4}em` }}>
            <span>{b.t}</span>
            <FigEmbed url={figBase + b.f} />
          </div>
        ) : (
          <p key={i} style={{ paddingLeft: `${b.i * 1.4}em` }}>
            {b.t}
          </p>
        ),
      )}
    </div>
  );
}

/** 機能2-C: 由来（blame）ビュー。各項・号がどの改正で導入されたかを左帯で示す */
function BlameView({
  data,
  article,
  lines,
  blame,
  figBase,
  onJump,
}: {
  data: Dataset;
  article: Article;
  lines: Line[];
  blame: number[];
  figBase?: string;
  onJump: (changeIdx: number) => void;
}) {
  const total = article.changes.length;
  return (
    <div className="blame">
      <p className="hint">左の帯が濃いほど新しい改正で導入された部分です。帯をクリックするとその改正の差分へ移動します。</p>
      {lines.map((l, i) => {
        const ci = blame[i] ?? 0;
        const snap = data.snapshots[article.changes[ci].s];
        const isRunStart = i === 0 || blame[i - 1] !== ci;
        const depth = total <= 1 ? 0 : ci / (total - 1);
        const isBase = ci === 0 && article.changes[0].s === 0;
        return (
          <div key={i} className="blame-row">
            <button
              className="blame-band"
              style={{ ["--age" as string]: depth }}
              title={
                (isBase ? "収録開始時点から存在" : `${snap.date} 施行の改正で導入`) +
                (snap.amendments[0] ? `｜${snap.amendments[0].lawNum}` : "")
              }
              onClick={() => onJump(ci)}
            >
              {isRunStart ? (isBase ? "収録時" : snap.date.slice(0, 7)) : ""}
            </button>
            <p style={{ paddingLeft: `${l.i * 1.4}em` }}>
              <LineText line={l} figBase={figBase} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
