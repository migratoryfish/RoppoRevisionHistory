export interface Line {
  /** インデント深さ（0=項、1=号、2=イ・ロ・ハ…） */
  i: number;
  /** テキスト */
  t: string;
}

/** ある条の内容が変わった1イベント。gone=true はその施行日に条が消滅したことを表す */
export interface Change {
  /** snapshots のインデックス */
  s: number;
  title?: string;
  caption?: string;
  lines?: Line[];
  gone?: boolean;
}

export interface Article {
  key: string;
  part: string;
  chapter: string;
  changes: Change[];
}

export interface Amendment {
  lawNum: string;
  lawTitle: string | null;
  promulgated: string;
  comment: string | null;
}

/** 施行日ごとに集約したバージョン */
export interface Snapshot {
  date: string;
  amendments: Amendment[];
}

export interface Dataset {
  lawId: string;
  lawTitle: string;
  lawNum: string;
  category: string;
  /** true = 現行版のみ収録（履歴・差分なし） */
  latestOnly: boolean;
  generated: string;
  snapshots: Snapshot[];
  articles: Article[];
}

export interface LawIndexEntry {
  id: string;
  title: string;
  num: string;
  category: string;
  latestOnly: boolean;
  snapshots: number;
  articles: number;
  changed: number;
}

export interface LawIndex {
  generated: string;
  laws: LawIndexEntry[];
}

export type ChangeType = "add" | "mod" | "del";
