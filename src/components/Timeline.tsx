import { changeType, isUndeterminedDate, todayStr } from "../data";
import type { Article, Dataset } from "../types";

interface Props {
  data: Dataset;
  article: Article;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

const W = 920;
const H = 118;
const PAD = 46;
const AXIS_Y = 62;

/** 機能2-B: 条文バージョンの時系列タイムライン（施行日ベース・時間比例軸） */
export default function Timeline({ data, article, selectedIdx, onSelect }: Props) {
  const today = todayStr();
  // 施行日未確定（遠い将来の日付で表現される）は軸の範囲から除外し、右端に別枠で描く
  const dates = data.snapshots.map((s) => s.date).filter((d) => !isUndeterminedDate(d));
  const min = Date.parse(dates[0]) - 180 * 86400_000;
  const max = Date.parse(dates[dates.length - 1]) + 180 * 86400_000;
  const x = (d: string) => (isUndeterminedDate(d) ? W - 14 : PAD + ((Date.parse(d) - min) / (max - min)) * (W - 2 * PAD));

  const years: number[] = [];
  for (let y = new Date(min).getFullYear() + 1; y <= new Date(max).getFullYear(); y++) years.push(y);

  return (
    <svg className="timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="改正タイムライン">
      {/* 年グリッド */}
      {years.map((y) => (
        <g key={y}>
          <line x1={x(`${y}-01-01`)} y1={16} x2={x(`${y}-01-01`)} y2={AXIS_Y} className="tl-grid" />
          <text x={x(`${y}-01-01`)} y={12} className="tl-year">
            {y}
          </text>
        </g>
      ))}
      {/* 法令全体のスナップショット（薄いティック） */}
      {dates.map((d) => (
        <line key={d} x1={x(d)} y1={AXIS_Y - 4} x2={x(d)} y2={AXIS_Y + 4} className="tl-tick" />
      ))}
      <line x1={PAD} y1={AXIS_Y} x2={W - PAD} y2={AXIS_Y} className="tl-axis" />
      {/* 現在線 */}
      <line x1={x(today)} y1={16} x2={x(today)} y2={H - 26} className="tl-today" />
      <text x={x(today)} y={H - 14} className="tl-today-label">
        現在
      </text>
      {/* この条の変更イベント */}
      {article.changes.map((c, i) => {
        const d = data.snapshots[c.s].date;
        const future = d > today;
        const type = i === 0 && c.s === 0 ? "base" : changeType(article, i);
        const cx = x(d);
        const sel = i === selectedIdx;
        return (
          <g key={i} className="tl-dot-g" onClick={() => onSelect(i)}>
            <circle cx={cx} cy={AXIS_Y} r={14} className="tl-hit" />
            {sel && <circle cx={cx} cy={AXIS_Y} r={10} className="tl-sel-ring" />}
            <circle
              cx={cx}
              cy={AXIS_Y}
              r={6}
              className={`tl-dot ${type}${future ? " future" : ""}`}
            />
            <text x={cx} y={AXIS_Y + 24} className={"tl-date" + (sel ? " sel" : "")} transform={`rotate(28 ${cx} ${AXIS_Y + 24})`}>
              {isUndeterminedDate(d) ? "未確定" : d}
            </text>
            <title>
              {isUndeterminedDate(d) ? "施行日未確定" : d + (future ? "（未施行）" : "")}｜
              {type === "base" ? "収録開始" : type === "del" ? "削除" : type === "add" ? "追加" : "改正"}
            </title>
          </g>
        );
      })}
    </svg>
  );
}
