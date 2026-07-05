import { useEffect, useState } from "react";
import ArticleView from "./components/ArticleView";
import HeatmapView from "./components/HeatmapView";
import Sidebar from "./components/Sidebar";
import { defaultChangeIdx, loadDataset } from "./data";
import type { Dataset } from "./types";

type Route = { view: "map" } | { view: "article"; key: string; change?: number };

function parseHash(): Route {
  const seg = location.hash.replace(/^#\/?/, "").split("/");
  if (seg[0] === "a" && seg[1]) {
    const change = seg[2] !== undefined && seg[2] !== "" ? Number(seg[2]) : undefined;
    return { view: "article", key: decodeURIComponent(seg[1]), change };
  }
  return { view: "map" };
}

function toHash(r: Route): string {
  if (r.view === "article") {
    return "#/a/" + encodeURIComponent(r.key) + (r.change !== undefined ? "/" + r.change : "");
  }
  return "#/map";
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    loadDataset().then(setData, (e) => setError(String(e)));
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = (r: Route) => {
    location.hash = toHash(r);
  };

  if (error) return <div className="loading error">{error}</div>;
  if (!data) return <div className="loading">データを読み込んでいます…</div>;

  let body;
  if (route.view === "map") {
    body = <HeatmapView data={data} onOpenArticle={(key, change) => nav({ view: "article", key, change })} />;
  } else {
    const article = data.articles.find((a) => a.key === route.key) ?? data.articles[0];
    const maxIdx = article.changes.length - 1;
    const changeIdx =
      route.change !== undefined && Number.isFinite(route.change)
        ? Math.min(Math.max(0, route.change), maxIdx)
        : defaultChangeIdx(article, data);
    body = (
      <div className="article-layout">
        <Sidebar data={data} activeKey={article.key} onPick={(key) => nav({ view: "article", key })} />
        <ArticleView
          data={data}
          article={article}
          changeIdx={changeIdx}
          onSelectChange={(idx) => nav({ view: "article", key: article.key, change: idx })}
          onOpenArticle={(key, change) => nav({ view: "article", key, change })}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-head">
        <h1>
          {data.lawTitle} 改正履歴ビューア
          <span className="law-num">{data.lawNum}</span>
        </h1>
        <nav className="app-tabs">
          <button className={route.view === "map" ? "active" : ""} onClick={() => nav({ view: "map" })}>
            改正マップ
          </button>
          <button className={route.view === "article" ? "active" : ""} onClick={() => nav({ view: "article", key: "1" })}>
            条文ビュー
          </button>
        </nav>
        <div className="data-note">データ: e-Gov 法令API v2（{data.generated} 取得）｜施行日ベース</div>
      </header>
      <main>{body}</main>
    </div>
  );
}
