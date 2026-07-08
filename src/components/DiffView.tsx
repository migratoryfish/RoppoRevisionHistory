import { useMemo } from "react";
import { toSplitRows, type DiffRow, type Seg } from "../diff";
import { SegContent } from "./LineContent";

interface Props {
  rows: DiffRow[];
  /** 見出し・条名が変わった場合の文字レベル差分（本文diffの先頭に別枠で表示） */
  head?: { del: Seg[]; add: Seg[] } | null;
  /** unified = GitHub風統合表示 / split = 新旧対照表（左=旧・右=新） */
  mode?: "unified" | "split";
  figBase?: string;
  figMap?: Map<string, string>;
}

/** 機能1: GitHub風の差分表示（行 = 項・号・表の行、変更行内は文字レベルのハイライト） */
export default function DiffView({ rows, head, mode = "split", figBase, figMap }: Props) {
  const srows = useMemo(() => (mode === "split" ? toSplitRows(rows) : []), [mode, rows]);
  if (mode === "split") {
    return (
      <div className="diff-wrap">
        <table className="diff split">
          <thead>
            <tr>
              <th colSpan={2}>改正前</th>
              <th colSpan={2}>改正後</th>
            </tr>
          </thead>
          {head && (
            <tbody className="head-diff">
              <tr>
                <td className="ln" />
                <td className="code del">
                  <SegContent segs={head.del} kind="del" />
                </td>
                <td className="ln" />
                <td className="code add">
                  <SegContent segs={head.add} kind="add" />
                </td>
              </tr>
            </tbody>
          )}
          <tbody>
            {srows.map((r, i) => (
              <tr key={i}>
                <td className="ln">{r.left?.oldNo ?? ""}</td>
                <td
                  className={"code " + (r.left ? (r.left.kind === "ctx" ? "ctx" : "del") : "none")}
                  style={r.left ? { paddingLeft: `${r.left.indent * 1.4 + 0.8}em` } : undefined}
                >
                  {/* ctx行は左右が同一内容のため、様式PDFの埋め込みは右（改正後）側だけに出す */}
                  {r.left && (
                    <SegContent
                      segs={r.left.segs}
                      kind="del"
                      figBase={figBase}
                      figMap={r.left.kind === "ctx" ? undefined : figMap}
                    />
                  )}
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
        {head && (
          <tbody className="head-diff">
            <tr className="del">
              <td className="ln" />
              <td className="ln" />
              <td className="sign">－</td>
              <td className="code">
                <SegContent segs={head.del} kind="del" />
              </td>
            </tr>
            <tr className="add">
              <td className="ln" />
              <td className="ln" />
              <td className="sign">＋</td>
              <td className="code">
                <SegContent segs={head.add} kind="add" />
              </td>
            </tr>
          </tbody>
        )}
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
