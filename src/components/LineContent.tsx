import type { Seg } from "../diff";
import type { Line } from "../types";

/** Seg列をセル（「｜」区切り）に分割する。表行でなければ null */
export function splitSegCells(segs: Seg[]): Seg[][] | null {
  if (!segs.some((s) => s.text.includes("｜"))) return null;
  const cells: Seg[][] = [[]];
  for (const s of segs) {
    const parts = s.text.split("｜");
    parts.forEach((p, i) => {
      if (i > 0) cells.push([]);
      if (p) cells[cells.length - 1].push({ text: p, hl: s.hl });
    });
  }
  return cells;
}

function Marks({ segs, kind }: { segs: Seg[]; kind?: string }) {
  return (
    <>
      {segs.map((s, i) =>
        s.hl ? (
          <mark key={i} className={kind}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** 様式PDFの折りたたみプレビュー */
export function FigEmbed({ url }: { url: string }) {
  return (
    <details className="fig-embed">
      <summary>様式PDFを表示</summary>
      <object data={url} type="application/pdf" aria-label="様式PDF">
        <p>
          埋め込み表示できない環境です。
          <a href={url} target="_blank" rel="noreferrer">
            PDFを別タブで開く
          </a>
        </p>
      </object>
      <a className="fig-link" href={url} target="_blank" rel="noreferrer">
        別タブで開く
      </a>
    </details>
  );
}

/** diff行（Seg列）の描画: 表行はセル区切り、様式は埋め込み */
export function SegContent({
  segs,
  kind,
  figBase,
  figMap,
}: {
  segs: Seg[];
  kind?: string;
  figBase?: string;
  figMap?: Map<string, string>;
}) {
  const text = segs.map((s) => s.text).join("");
  const f = figMap?.get(text);
  const cells = splitSegCells(segs);
  return (
    <>
      {cells ? (
        <span className="trow">
          {cells.map((c, i) => (
            <span key={i} className="tcell">
              <Marks segs={c} kind={kind} />
            </span>
          ))}
        </span>
      ) : (
        <Marks segs={segs} kind={kind} />
      )}
      {f && figBase && <FigEmbed url={figBase + f} />}
    </>
  );
}

/** 全文・blame用の1行描画（Line直接） */
export function LineText({ line, figBase }: { line: Line; figBase?: string }) {
  if (line.f && figBase) {
    return (
      <>
        <span>{line.t}</span>
        <FigEmbed url={figBase + line.f} />
      </>
    );
  }
  const cells = splitSegCells([{ text: line.t, hl: false }]);
  if (cells) {
    return (
      <span className="trow">
        {cells.map((c, i) => (
          <span key={i} className="tcell">
            <Marks segs={c} />
          </span>
        ))}
      </span>
    );
  }
  return <>{line.t}</>;
}
