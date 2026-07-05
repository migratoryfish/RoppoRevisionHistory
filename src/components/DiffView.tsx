import { toSplitRows, type DiffRow } from "../diff";
import { SegContent } from "./LineContent";

interface Props {
  rows: DiffRow[];
  /** unified = GitHub風統合表示 / split = 新旧対照表（左=旧・右=新） */
  mode?: "unified" | "split";
  figBase?: string;
  figMap?: Map<string, string>;
}

/** 機能1: GitHub風の差分表示（行 = 項・号・表の行、変更行内は文字レベルのハイライト） */
export default function DiffView({ rows, mode = "unified", figBase, figMap }: Props) {
  if (mode === "split") {
    const srows = toSplitRows(rows);
    return (
      <div className="diff-wrap">
        <table className="diff split">
          <thead>
            <tr>
              <th colSpan={2}>改正前</th>
              <th colSpan={2}>改正後</th>
            </tr>
          </thead>
          <tbody>
            {srows.map((r, i) => (
              <tr key={i}>
                <td className="ln">{r.left?.oldNo ?? ""}</td>
                <td
                  className={"code " + (r.left ? (r.left.kind === "ctx" ? "ctx" : "del") : "none")}
                  style={r.left ? { paddingLeft: `${r.left.indent * 1.4 + 0.8}em` } : undefined}
                >
                  {r.left && <SegContent segs={r.left.segs} kind="del" figBase={figBase} figMap={figMap} />}
                </td>
                <td className="ln">{r.right?.newNo ?? ""}</td>
                <td
                  className={"code " + (r.right ? (r.right.kind === "ctx" ? "ctx" : "add") : "none")}
                  style={r.right ? { paddingLeft: `${r.right.indent * 1.4 + 0.8}em` } : undefined}
                >
                  {r.right && <SegContent segs={r.right.segs} kind="add" figBase={figBase} figMap={figMap} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="diff-wrap">
      <table className="diff">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.kind}>
              <td className="ln">{r.oldNo ?? ""}</td>
              <td className="ln">{r.newNo ?? ""}</td>
              <td className="sign">{r.kind === "add" ? "＋" : r.kind === "del" ? "－" : ""}</td>
              <td className="code" style={{ paddingLeft: `${r.indent * 1.4 + 0.8}em` }}>
                <SegContent segs={r.segs} kind={r.kind} figBase={figBase} figMap={figMap} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
