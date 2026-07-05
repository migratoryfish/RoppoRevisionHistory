import type { LawIndex, LawIndexEntry } from "../types";

interface Props {
  index: LawIndex;
  onOpen: (lawId: string) => void;
}

/** トップページ: カテゴリ別の法令一覧 */
export default function LawList({ index, onOpen }: Props) {
  const categories: { name: string; laws: LawIndexEntry[] }[] = [];
  for (const law of index.laws) {
    let cat = categories.at(-1);
    if (!cat || cat.name !== law.category) {
      cat = { name: law.category, laws: [] };
      categories.push(cat);
    }
    cat.laws.push(law);
  }

  return (
    <div className="law-list">
      <p className="hint">
        法令を選ぶと、改正マップ（いつ・どこが変わったかの俯瞰）と条文ごとの差分・タイムラインを閲覧できます。
      </p>
      {categories.map((cat) => (
        <section key={cat.name} className="law-cat">
          <h2>{cat.name}</h2>
          <div className="law-cards">
            {cat.laws.map((law) => (
              <button key={law.id} className="law-card" onClick={() => onOpen(law.id)}>
                <span className="law-card-title">{law.title}</span>
                <span className="law-card-num">{law.num}</span>
                <span className="law-card-stats">
                  {law.latestOnly ? (
                    <span className="badge base-badge">現行版のみ</span>
                  ) : law.snapshots <= 1 ? (
                    <span className="badge base-badge">収録期間内の改正なし</span>
                  ) : (
                    <>
                      {law.snapshots}版 ・ 変更{law.changed}条
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="hint">
        データ: e-Gov 法令API v2（{index.generated} 取得）｜施行日ベース｜収録範囲はe-Govが保持する2016年頃以降（未施行の将来改正を含む）
      </p>
    </div>
  );
}
