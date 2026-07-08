import { useEffect, useState } from "react";
import ArticleView from "./components/ArticleView";
import HeatmapView from "./components/HeatmapView";
import LawList from "./components/LawList";
import Sidebar from "./components/Sidebar";
import { defaultChangeIdx, loadIndex, loadLaw } from "./data";
import type { Dataset, LawIndex } from "./types";

type Route =
  | { view: "home" }
  | { view: "map"; law: string }
  | { view: "article"; law: string; key?: string; change?: number };

function parseHash(): Route {
  const seg = location.hash.replace(/^#\/?/, "").split("/");
  if (seg[0] === "l" && seg[1]) {
    const law = decodeURIComponent(seg[1]);
    if (seg[2] === "a") {
      const key = seg[3] ? decodeURIComponent(seg[3]) : undefined;
      const change = seg[4] !== undefined && seg[4] !== "" ? Number(seg[4]) : undefined;
      return { view: "article", law, key, change };
    }
    return { view: "map", law };
  }
  return { view: "home" };
}

function toHash(r: Route): string {
  switch (r.view) {
    case "home":
      return "#/";
    case "map":
      return `#/l/${encodeURIComponent(r.law)}`;
    case "article":
      return (
        `#/l/${encodeURIComponent(r.law)}/a` +
        (r.key !== undefined ? `/${encodeURIComponent(r.key)}` : "") +
        (r.key !== undefined && r.change !== undefined ? `/${r.change}` : "")
      );
  }
}

export default function App() {
  const [index, setIndex] = useState<LawIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(parseHash());
  const [law, setLaw] = useState<Dataset | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex, (e) => setError(String(e)));
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const lawId = route.view === "home" ? null : route.law;
  useEffect(() => {
    if (!lawId) return;
    let alive = true;
    setLaw(null);
    loadLaw(lawId).then(
      (d) => {
        if (alive) setLaw(d);
      },
      (e) => setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, [lawId]);

  const nav = (r: Route) => {
    location.hash = toHash(r);
  };

  if (error) return <div className="loading error">{error}</div>;
  if (!index) return <div className="loading">データを読み込んでいます…</div>;

  let body;
  if (route.view === "home") {
    body = <LawList index={index} onOpen={(id) => nav({ view: "map", law: id })} />;
  } else if (!law || law.lawId !== route.law) {
    body = <div className="loading">法令データを読み込んでいます…</div>;
  } else if (route.view === "map") {
    body = (
      <HeatmapView
        data={law}
        onOpenArticle={(key, change) => nav({ view: "article", law: law.lawId, key, change })}
      />
    );
  } else {
    const article = law.articles.find((a) => a.key === route.key) ?? law.articles[0];
    const maxIdx = article.changes.length - 1;
    const changeIdx =
      route.change !== undefined && Number.isFinite(route.change)
        ? Math.min(Math.max(0, route.change), maxIdx)
        : defaultChangeIdx(article, law);
    body = (
      <div className="article-layout">
        <Sidebar data={law} activeKey={article.key} onPick={(key) => nav({ view: "article", law: law.lawId, key })} />
        <ArticleView
          data={law}
          article={article}
          changeIdx={changeIdx}
          onSelectChange={(idx) => nav({ view: "article", law: law.lawId, key: article.key, change: idx })}
          onOpenArticle={(key, change) => nav({ view: "article", law: law.lawId, key, change })}
        />
      </div>
    );
  }

  const currentEntry = lawId ? index.laws.find((l) => l.id === lawId) : null;

  return (
    <div className="app">
      <header className="app-head">
        <h1>
          <button className="home-link" onClick={() => nav({ view: "home" })}>
            法令改正履歴ビューア
          </button>
          {currentEntry && (
            <>
              <span className="crumb-sep">›</span>
              <span className="crumb-law">{currentEntry.title}</span>
              <span className="law-num">{currentEntry.num}</span>
            </>
          )}
        </h1>
        {currentEntry && (
          <nav className="app-tabs">
            <button className={route.view === "map" ? "active" : ""} onClick={() => nav({ view: "map", law: currentEntry.id })}>
              改正マップ
            </button>
            <button
              className={route.view === "article" ? "active" : ""}
              onClick={() => nav({ view: "article", law: currentEntry.id })}
            >
              条文ビュー
            </button>
          </nav>
        )}
        <div className="data-note">
          データ: e-Gov 法令API v2（{index.generated} 取得）｜施行日ベース
          <span className="app-version">v{__APP_VERSION__}</span>
        </div>
      </header>
      <main>{body}</main>
    </div>
  );
}
