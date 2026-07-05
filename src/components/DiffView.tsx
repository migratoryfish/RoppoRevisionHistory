import type { DiffRow } from "../diff";

/** 機能1: GitHub風の差分表示（行 = 項・号、変更行内は文字レベルのハイライト） */
export default function DiffView({ rows }: { rows: DiffRow[] }) {
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
                {r.segs.map((s, j) =>
                  s.hl ? (
                    <mark key={j} className={r.kind}>
                      {s.text}
                    </mark>
                  ) : (
                    <span key={j}>{s.text}</span>
                  ),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
