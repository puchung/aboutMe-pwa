import Dexie, { Table } from 'dexie';

export interface PhotoTag {
  id: string;
  xPercent: number; // 0 ~ 100%
  yPercent: number; // 0 ~ 100%
  caption: string;
}

export interface PhotoData {
  id: string;
  blob: Blob;
  previewUrl?: string;
  tags: PhotoTag[];
}

export interface MoodRecord {
  id?: number;
  timestamp: number;
  dateStr: string;              // "2026-09-27" 用於指定日期檢索
  moodLevel: 1 | 2 | 3 | 4 | 5; // 1: 低落 ~ 5: 雀躍
  moodLabel: string;
  note: string;
  photos: PhotoData[];
  createdAt: string;            // 格式化顯示時間
  updatedAt?: number;           // 編輯更新時間戳記
  appVersion: string;
}

export class MindLogDatabase extends Dexie {
  records!: Table<MoodRecord>;

  constructor() {
    super('MindLogDB');
    // 版本升級：加入 dateStr 索引以支援日期查詢
    this.version(2).stores({
      records: '++id, timestamp, dateStr, moodLevel'
    });
  }
}

export const db = new MindLogDatabase();