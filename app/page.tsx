'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import imageCompression from 'browser-image-compression';
import { 
  Smile, Frown, Meh, Laugh, Angry, 
  Camera, MapPin, Send, Trash2, Calendar as CalendarIcon, 
  Clock, Edit3, X, ChevronLeft, ChevronRight, RotateCcw, Check,
  Upload, Image as ImageIcon, Cloud, CloudOff, RefreshCw, 
  ChevronUp, ChevronDown, Bug, Copy, Trash
} from 'lucide-react';
import { db, MoodRecord, PhotoData, PhotoTag } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const APP_VERSION = 'Ver. 001.006.000';
const DEFAULT_TITLE = 'MindLog';
const SYNC_ROW_ID = 'user_mindlog_store';

interface HeaderConfig {
  title: string;
  avatarUrl: string | null;
}

const MOODS: { level: 1 | 2 | 3 | 4 | 5; label: string; icon: any; color: string }[] = [
  { level: 5, label: '雀躍', icon: Laugh, color: 'text-amber-500 hover:bg-amber-50' },
  { level: 4, label: '愉快', icon: Smile, color: 'text-emerald-500 hover:bg-emerald-50' },
  { level: 3, label: '平靜', icon: Meh, color: 'text-blue-500 hover:bg-blue-50' },
  { level: 2, label: '焦慮', icon: Frown, color: 'text-orange-500 hover:bg-orange-50' },
  { level: 1, label: '低落', icon: Angry, color: 'text-rose-500 hover:bg-rose-50' },
];

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = (base64: string): Blob => {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

export default function MindLogPage() {
  const todayStr = new Date().toISOString().split('T')[0];

  // 🐞 診斷日誌系統
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);

  const appendLog = (msg: string) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const logItem = `[${timeStr}] ${msg}`;
    console.log(logItem);
    setDebugLogs((prev) => [logItem, ...prev.slice(0, 50)]);
  };

  // 全域例外捕獲
  useEffect(() => {
    appendLog(`系統初始化: ${APP_VERSION}`);
    const handleError = (e: ErrorEvent) => {
      appendLog(`❌ 全域錯誤: ${e.message} (行號: ${e.lineno})`);
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      appendLog(`❌ 未捕捉 Promise 異常: ${e.reason?.message || e.reason}`);
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // 🌿 標題與使用者頭像
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>({
    title: DEFAULT_TITLE,
    avatarUrl: null
  });
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [tempTitle, setTempTitle] = useState(DEFAULT_TITLE);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);
  const headerFileRef = useRef<HTMLInputElement>(null);

  // 📱 行動端底部編輯器展開/收折
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ☁️ 雲端同步狀態
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');

  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [note, setNote] = useState('');
  const [stagedPhoto, setStagedPhoto] = useState<PhotoData | null>(null);
  const [tempTagCaption, setTempTagCaption] = useState('');
  const [pendingTagPos, setPendingTagPos] = useState<{ x: number; y: number } | null>(null);

  // 📅 指定記錄日期
  const [targetRecordDate, setTargetRecordDate] = useState<string>(todayStr);

  // 📝 編輯狀態管理
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);

  // 📅 日期過濾
  const [filterDate, setFilterDate] = useState<string>('');

  // 讀取本機 IndexedDB 日誌
  const entries = useLiveQuery(async () => {
    if (filterDate) {
      return db.records.where('dateStr').equals(filterDate).reverse().sortBy('timestamp');
    }
    return db.records.orderBy('timestamp').reverse().toArray();
  }, [filterDate]);

  // 1. 初次載入與 Supabase 同步
  useEffect(() => {
    const pullFromCloud = async () => {
      try {
        setSyncStatus('syncing');
        appendLog('開始自 Supabase 拉取雲端資料...');
        const { data, error } = await supabase
          .from('mindlog_sync')
          .select('*')
          .eq('id', SYNC_ROW_ID)
          .single();

        if (error && error.code !== 'PGRST116') {
          appendLog(`⚠️ Supabase 雲端拉取回應: ${error.message} (代碼: ${error.code})`);
          setSyncStatus('synced');
          return;
        }

        if (data) {
          if (data.settings) {
            setHeaderConfig(data.settings);
            setTempTitle(data.settings.title || DEFAULT_TITLE);
            setTempAvatar(data.settings.avatarUrl || null);
            localStorage.setItem('mindlog_header_config', JSON.stringify(data.settings));
            appendLog('已同步雲端標題與頭像設定');
          }

          if (data.entries && Array.isArray(data.entries)) {
            const cloudRecords = data.entries;
            await db.records.clear();
            for (const item of cloudRecords) {
              const restoredPhotos = (item.photos || []).map((p: any) => ({
                ...p,
                blob: p.base64 ? base64ToBlob(p.base64) : null
              }));
              await db.records.add({
                ...item,
                photos: restoredPhotos
              });
            }
            appendLog(`成功同步雲端日記共 ${cloudRecords.length} 筆`);
          }
        } else {
          appendLog('雲端尚無備份資料');
        }
        setSyncStatus('synced');
      } catch (err: any) {
        appendLog(`❌ 雲端拉取異常: ${err?.message || err}`);
        setSyncStatus('error');
      }
    };

    pullFromCloud();
  }, []);

  // 2. 資料推送至 Supabase
  const pushToCloud = async (newSettings?: HeaderConfig) => {
    try {
      setSyncStatus('syncing');
      appendLog('正在打包本機資料並同步至 Supabase...');
      const curSettings = newSettings || headerConfig;
      const allLocalRecords = await db.records.toArray();

      const serializableEntries = await Promise.all(
        allLocalRecords.map(async (rec) => {
          const serializedPhotos = await Promise.all(
            (rec.photos || []).map(async (p) => ({
              id: p.id,
              caption: p.tags?.[0]?.caption || '',
              tags: p.tags,
              base64: p.blob ? await blobToBase64(p.blob) : null
            }))
          );
          return { ...rec, photos: serializedPhotos };
        })
      );

      const { error } = await supabase.from('mindlog_sync').upsert({
        id: SYNC_ROW_ID,
        settings: curSettings,
        entries: serializableEntries,
        updated_at: new Date().toISOString()
      });

      if (error) {
        appendLog(`❌ Supabase 寫入失敗: ${error.message}`);
        throw error;
      }
      appendLog('✅ Supabase 雲端資料庫同步完成');
      setSyncStatus('synced');
    } catch (err: any) {
      appendLog(`❌ 推送雲端發生錯誤: ${err?.message || err}`);
      setSyncStatus('error');
    }
  };

  // 3. 頭像與標題處理
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      appendLog(`開始壓縮頭像檔案: ${file.name} (${Math.round(file.size / 1024)} KB)`);
      const options = { maxSizeMB: 0.08, maxWidthOrHeight: 256, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempAvatar(reader.result as string);
        appendLog('頭像處理完成');
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err: any) {
      appendLog(`❌ 標題圖片壓縮失敗: ${err?.message || err}`);
    }
  };

  const saveHeaderConfig = async () => {
    const updated: HeaderConfig = {
      title: tempTitle.trim() || DEFAULT_TITLE,
      avatarUrl: tempAvatar
    };
    setHeaderConfig(updated);
    localStorage.setItem('mindlog_header_config', JSON.stringify(updated));
    setIsEditingHeader(false);
    appendLog(`儲存標題設定: [${updated.title}]`);
    await pushToCloud(updated);
  };

  const resetHeaderConfig = async () => {
    const def: HeaderConfig = { title: DEFAULT_TITLE, avatarUrl: null };
    setHeaderConfig(def);
    setTempTitle(DEFAULT_TITLE);
    setTempAvatar(null);
    localStorage.removeItem('mindlog_header_config');
    setIsEditingHeader(false);
    appendLog('已還原預設標題設定');
    await pushToCloud(def);
  };

  // 4. 照片與標記處理
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      appendLog(`選取相片: ${file.name} (${Math.round(file.size / 1024)} KB)，正在壓縮...`);
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressedBlob);

      setStagedPhoto({
        id: crypto.randomUUID(),
        blob: compressedBlob,
        previewUrl,
        tags: []
      });
      setIsDrawerOpen(true);
      appendLog('相片已成功掛載至暫存區');
    } catch (err: any) {
      appendLog(`❌ 相片壓縮失敗: ${err?.message || err}`);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingTagPos({ x: xPercent, y: yPercent });
  };

  const addTagToPhoto = () => {
    if (!stagedPhoto || !pendingTagPos || !tempTagCaption.trim()) return;
    const newTag: PhotoTag = {
      id: crypto.randomUUID(),
      xPercent: pendingTagPos.x,
      yPercent: pendingTagPos.y,
      caption: tempTagCaption.trim()
    };
    setStagedPhoto({
      ...stagedPhoto,
      tags: [...stagedPhoto.tags, newTag]
    });
    setPendingTagPos(null);
    setTempTagCaption('');
    appendLog(`釘選相片標籤: "${newTag.caption}"`);
  };

  // 5. 核心儲存/更新日誌函式 (加入完整診斷攔截)
  const handleSubmit = async () => {
    appendLog('【操作】點擊儲存按鈕，開始檢查送出資料...');
    appendLog(`檢查欄位: 文字長度=${note.trim().length}, 照片掛載=${!!stagedPhoto}, 指定日期=${targetRecordDate}, 編輯ID=${editingRecordId || '新增模式'}`);

    if (!note.trim() && !stagedPhoto) {
      appendLog('⚠️ 阻擋儲存: 文字內容與相片皆為空，請輸入文字或拍照！');
      alert('請先輸入隨筆文字或拍下一張照片！');
      return;
    }

    try {
      const moodObj = MOODS.find(m => m.level === selectedMood)!;
      const assignedDate = new Date(`${targetRecordDate}T12:00:00`);
      const dateStr = targetRecordDate;

      if (editingRecordId) {
        appendLog(`正在更新 IndexedDB 紀錄 (ID: ${editingRecordId})...`);
        await db.records.update(editingRecordId, {
          dateStr,
          moodLevel: selectedMood,
          moodLabel: moodObj.label,
          note: note.trim(),
          photos: stagedPhoto ? [stagedPhoto] : [],
          updatedAt: Date.now(),
        });
        appendLog(`✅ IndexedDB 紀錄 (ID: ${editingRecordId}) 更新成功`);
        setEditingRecordId(null);
      } else {
        appendLog('正在寫入 IndexedDB 全新紀錄...');
        const newRecord: MoodRecord = {
          timestamp: assignedDate.getTime(),
          dateStr,
          moodLevel: selectedMood,
          moodLabel: moodObj.label,
          note: note.trim(),
          photos: stagedPhoto ? [stagedPhoto] : [],
          createdAt: assignedDate.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' }),
          appVersion: APP_VERSION
        };
        const newId = await db.records.add(newRecord);
        appendLog(`✅ IndexedDB 寫入成功，產生新 ID: ${newId}`);
      }

      setNote('');
      setStagedPhoto(null);
      setPendingTagPos(null);
      setTargetRecordDate(filterDate || todayStr);
      setIsDrawerOpen(false);

      // 觸發雲端儲存
      await pushToCloud();
    } catch (err: any) {
      appendLog(`❌ 儲存過程發生嚴重例外: ${err?.message || err}`);
      setShowLogModal(true);
    }
  };

  const handleStartEdit = (record: MoodRecord) => {
    appendLog(`【操作】載入紀錄編輯 (ID: ${record.id}, 日期: ${record.dateStr})`);
    setEditingRecordId(record.id!);
    setSelectedMood(record.moodLevel);
    setNote(record.note);
    setTargetRecordDate(record.dateStr);

    if (record.photos && record.photos.length > 0) {
      const p = record.photos[0];
      setStagedPhoto({
        ...p,
        previewUrl: p.blob ? URL.createObjectURL(p.blob) : undefined
      });
    } else {
      setStagedPhoto(null);
    }

    setIsDrawerOpen(true);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    appendLog('【操作】取消編輯');
    setEditingRecordId(null);
    setNote('');
    setStagedPhoto(null);
    setPendingTagPos(null);
    setTargetRecordDate(filterDate || todayStr);
    setIsDrawerOpen(false);
  };

  const handleDelete = async (record: MoodRecord) => {
    if (window.confirm(`確定要刪除 ${record.dateStr} 的這篇心情隨筆嗎？\n此動作將同步從雲端抹除。`)) {
      if (record.id) {
        appendLog(`【操作】刪除紀錄 (ID: ${record.id})`);
        await db.records.delete(record.id);
        if (editingRecordId === record.id) {
          handleCancelEdit();
        }
        await pushToCloud();
      }
    }
  };

  const handleShiftDate = (days: number) => {
    const baseDate = filterDate ? new Date(filterDate) : new Date();
    baseDate.setDate(baseDate.getDate() + days);
    const newDateStr = baseDate.toISOString().split('T')[0];
    setFilterDate(newDateStr);
    if (!editingRecordId) {
      setTargetRecordDate(newDateStr);
    }
  };

  const handleCopyLogs = () => {
    const text = debugLogs.join('\n');
    navigator.clipboard.writeText(text);
    alert('✅ 已複製最新診斷日誌至剪貼簿！');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col md:flex-row font-sans">
      
      {/* ──────────────── PC 版維持左側邊欄 ──────────────── */}
      <aside className={`hidden md:flex w-96 bg-white border-r border-slate-200 p-5 flex-col justify-between shrink-0 shadow-sm h-screen sticky top-0 transition-all ${
        editingRecordId ? 'ring-2 ring-amber-400/80 bg-amber-50/10' : ''
      }`}>
        <div>
          {/* PC 頂部標題 */}
          <div className="mb-5 pb-3 border-b border-slate-100 flex items-center justify-between">
            {!isEditingHeader ? (
              <div 
                onClick={() => setIsEditingHeader(true)}
                className="flex items-center gap-3 cursor-pointer select-none group flex-1"
                title="點擊自訂標題與圖示"
              >
                {headerConfig.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={headerConfig.avatarUrl} alt="頭像" className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-sm" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-lg shadow-sm">🌿</div>
                )}
                <div className="flex items-center gap-1.5">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 group-hover:text-blue-600 transition">{headerConfig.title}</h1>
                  <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-3 w-full">
                <div className="text-xs font-semibold text-slate-500">自訂 App 標題與照片</div>
                <div className="flex items-center gap-3">
                  {tempAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tempAvatar} alt="預覽頭像" className="w-12 h-12 rounded-xl object-cover border-2 border-blue-500 shadow" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 border border-dashed border-slate-300">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => headerFileRef.current?.click()}
                      className="text-xs bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-medium shadow-sm"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600" /> 上傳相片
                    </button>
                    <input ref={headerFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>
                </div>
                <input 
                  type="text" 
                  maxLength={15} 
                  value={tempTitle} 
                  onChange={(e) => setTempTitle(e.target.value)} 
                  placeholder="輸入標題" 
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-500 bg-white" 
                />
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={resetHeaderConfig} className="text-[11px] text-slate-400 hover:text-rose-500">恢復預設</button>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setIsEditingHeader(false)} className="text-xs px-2.5 py-1 text-slate-500 hover:bg-slate-200 rounded-lg">取消</button>
                    <button type="button" onClick={saveHeaderConfig} className="text-xs bg-blue-600 text-white font-medium px-3 py-1 rounded-lg shadow-sm hover:bg-blue-700">儲存並同步</button>
                  </div>
                </div>
              </div>
            )}

            {/* 🐞 PC 端狀態工具列 */}
            {!isEditingHeader && (
              <div className="flex items-center gap-2 pl-2">
                <button
                  type="button"
                  onClick={() => setShowLogModal(true)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500"
                  title="開啟診斷日誌"
                >
                  <Bug className="w-4 h-4 text-amber-600" />
                </button>
                {syncStatus === 'syncing' && <div title="正在同步至雲端..." className="p-1.5 rounded-lg bg-amber-50 text-amber-500"><RefreshCw className="w-4 h-4 animate-spin" /></div>}
                {syncStatus === 'synced' && <div title="☁️ 雲端已即時同步" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600"><Cloud className="w-4 h-4" /></div>}
                {syncStatus === 'error' && <div title="❌ 同步異常" className="p-1.5 rounded-lg bg-rose-50 text-rose-500"><CloudOff className="w-4 h-4" /></div>}
              </div>
            )}
          </div>

          {/* 編輯指示條 */}
          {editingRecordId && (
            <div className="mb-4 bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1"><Edit3 className="w-3.5 h-3.5 text-amber-600" /> 正在編輯 {targetRecordDate} 的記事</span>
              <button onClick={handleCancelEdit} className="text-amber-700 hover:text-amber-900 p-0.5"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* 記錄日期 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">記錄日期</label>
              {targetRecordDate !== todayStr && (
                <button type="button" onClick={() => setTargetRecordDate(todayStr)} className="text-[11px] text-blue-600 hover:underline">切換為今天</button>
              )}
            </div>
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
              <CalendarIcon className="w-4 h-4 text-blue-500 ml-1" />
              <input type="date" value={targetRecordDate} onChange={(e) => setTargetRecordDate(e.target.value)} className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer" />
            </div>
          </div>

          {/* 心情選擇 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">當日心情</label>
            <div className="grid grid-cols-5 gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              {MOODS.map((m) => {
                const IconComponent = m.icon;
                const isSelected = selectedMood === m.level;
                return (
                  <button
                    key={m.level}
                    type="button"
                    onClick={() => setSelectedMood(m.level)}
                    className={`flex flex-col items-center py-2 rounded-lg transition-all text-xs font-medium ${
                      isSelected ? 'bg-white shadow text-slate-900 font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <IconComponent className={`w-5 h-5 mb-1 ${isSelected ? m.color.split(' ')[0] : ''}`} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 相片上傳 */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">相片紀錄</label>
            {!stagedPhoto ? (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-blue-400 bg-slate-50 transition-colors">
                <Camera className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">拍照或選取照片</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              </label>
            ) : (
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-black/5">
                <div className="relative cursor-crosshair group" onClick={handleImageClick}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stagedPhoto.previewUrl} alt="預覽" className="w-full h-44 object-cover select-none" />
                  {stagedPhoto.tags.map((tag) => (
                    <div key={tag.id} style={{ top: `${tag.yPercent}%`, left: `${tag.xPercent}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 bg-black/75 backdrop-blur-md text-white text-[11px] px-2 py-0.5 rounded-full shadow pointer-events-none flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 text-amber-400" />
                      {tag.caption}
                    </div>
                  ))}
                </div>
                {pendingTagPos && (
                  <div className="p-2 bg-white border-t border-slate-200 flex gap-2">
                    <input type="text" placeholder="在這處留一句話..." value={tempTagCaption} onChange={(e) => setTempTagCaption(e.target.value)} className="text-xs flex-1 border border-slate-300 rounded px-2 py-1 outline-none focus:border-blue-500" autoFocus />
                    <button onClick={addTagToPhoto} className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded font-medium">標記</button>
                  </div>
                )}
                <button onClick={() => setStagedPhoto(null)} className="absolute top-2 right-2 bg-white/80 backdrop-blur p-1 rounded-full text-slate-700 hover:text-rose-600 shadow">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 隨筆文字 */}
          <div className="mb-4">
            <textarea
              rows={3}
              placeholder="記錄該日的心情隨筆..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>

          {/* 送出與取消 */}
          <div className="flex gap-2">
            {editingRecordId && (
              <button type="button" onClick={handleCancelEdit} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2.5 px-4 rounded-xl transition text-sm">取消</button>
            )}
            <button
              onClick={handleSubmit}
              className={`flex-1 text-white font-medium py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition text-sm ${
                editingRecordId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {editingRecordId ? <><Check className="w-4 h-4" /> 儲存修改</> : <><Send className="w-4 h-4" /> 儲存至 {targetRecordDate}</>}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Supabase 即時雲端同步</span>
          <span className="font-mono">{APP_VERSION}</span>
        </div>
      </aside>

      {/* ──────────────── 主畫面容器：上半部時間軸＋手機版常駐頂欄 ──────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        
        {/* 📱 手機專屬頂部常駐標題列 (新增 🐞 診斷日誌按鈕) */}
        <header className="md:hidden bg-white/95 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
          {!isEditingHeader ? (
            <div onClick={() => setIsEditingHeader(true)} className="flex items-center gap-2.5 cursor-pointer">
              {headerConfig.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={headerConfig.avatarUrl} alt="頭像" className="w-8 h-8 rounded-xl object-cover border border-slate-200" />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-base">🌿</div>
              )}
              <h1 className="text-base font-bold text-slate-900">{headerConfig.title}</h1>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full justify-between">
              <input 
                type="text" 
                maxLength={15} 
                value={tempTitle} 
                onChange={(e) => setTempTitle(e.target.value)} 
                className="text-xs border rounded-lg px-2 py-1 w-32" 
              />
              <div className="flex gap-1">
                <button onClick={() => setIsEditingHeader(false)} className="text-xs px-2 py-1 text-slate-500">取消</button>
                <button onClick={saveHeaderConfig} className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg">儲存</button>
              </div>
            </div>
          )}

          {!isEditingHeader && (
            <div className="flex items-center gap-2">
              {/* 🐞 手機端診斷日誌按鈕 */}
              <button
                type="button"
                onClick={() => setShowLogModal(true)}
                className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 active:scale-95"
                title="查看日誌"
              >
                <Bug className="w-4 h-4 text-amber-600" />
              </button>

              {syncStatus === 'syncing' && <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />}
              {syncStatus === 'synced' && <Cloud className="w-4 h-4 text-emerald-600" />}
              {syncStatus === 'error' && <CloudOff className="w-4 h-4 text-rose-500" />}
            </div>
          )}
        </header>

        {/* ──────────────── 上半部：日期篩選與日記時間軸 ──────────────── */}
        <main className="flex-1 max-w-2xl mx-auto w-full p-4 md:p-8 pb-36 md:pb-8">
          
          {/* 📅 指定日期過濾工具列 */}
          <div className="bg-white rounded-2xl p-3 border border-slate-200/90 shadow-sm mb-5 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              <button onClick={() => handleShiftDate(-1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600" title="前一天">
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-blue-600" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilterDate(val);
                    if (val && !editingRecordId) setTargetRecordDate(val);
                  }}
                  className="text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-500"
                />
              </div>

              <button onClick={() => handleShiftDate(1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600" title="後一天">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end text-xs">
              <button
                onClick={() => {
                  setFilterDate(todayStr);
                  if (!editingRecordId) setTargetRecordDate(todayStr);
                }}
                className={`px-2.5 py-1 rounded-lg border transition ${
                  filterDate === todayStr ? 'bg-blue-50 text-blue-600 border-blue-200 font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                今天
              </button>
              <button
                onClick={() => setFilterDate('')}
                className={`px-2.5 py-1 rounded-lg border transition flex items-center gap-1 ${
                  !filterDate ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <RotateCcw className="w-3 h-3" /> 全部
              </button>
            </div>
          </div>

          {/* 筆數狀態 */}
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> 
              {filterDate ? `指定：${filterDate}` : '隨筆時間軸'}
            </h2>
            <span className="text-xs text-slate-400">共 {entries?.length || 0} 篇</span>
          </div>

          {/* 日記清單 */}
          <div className="space-y-3.5">
            {entries?.map((record) => {
              const mood = MOODS.find(m => m.level === record.moodLevel);
              const Icon = mood?.icon || Meh;
              const isEditing = editingRecordId === record.id;

              return (
                <article 
                  key={record.id} 
                  className={`bg-white rounded-2xl p-4 border transition-all shadow-sm ${
                    isEditing ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg bg-slate-50 ${mood?.color.split(' ')[0]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{record.moodLabel}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {record.dateStr}
                      </span>
                      <button onClick={() => handleStartEdit(record)} className="p-1 rounded text-slate-400 hover:text-amber-600 transition" title="編輯">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(record)} className="p-1 rounded text-slate-400 hover:text-rose-600 transition" title="刪除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {record.photos && record.photos.length > 0 && record.photos[0].blob && (
                    <div className="relative rounded-xl overflow-hidden mb-2.5 border border-slate-100 bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(record.photos[0].blob)} alt="記錄照片" className="w-full max-h-80 object-cover" />
                      {record.photos[0].tags?.map((tag) => (
                        <div key={tag.id} style={{ top: `${tag.yPercent}%`, left: `${tag.xPercent}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 bg-black/70 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full shadow-lg border border-white/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {tag.caption}
                        </div>
                      ))}
                    </div>
                  )}

                  {record.note && (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {record.note}
                    </p>
                  )}

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>歸檔：{record.dateStr}{record.updatedAt && ' (已編輯)'}</span>
                    <span className="font-mono text-[10px] text-slate-300">{record.appVersion}</span>
                  </div>
                </article>
              );
            })}

            {(!entries || entries.length === 0) && (
              <div className="text-center py-16 text-slate-400 border border-dashed rounded-2xl bg-white/50">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{filterDate ? `${filterDate} 尚無任何心情記錄` : '尚無記錄，點擊下方開始記錄！'}</p>
              </div>
            )}
          </div>

          <div className="mt-8 text-center text-xs text-slate-400 font-mono">
            MindLog PWA · {APP_VERSION}
          </div>
        </main>

        {/* ──────────────── 📱 手機專屬：下半部吸底抽屜／輸入區 ──────────────── */}
        <section className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 rounded-t-3xl ${
          isDrawerOpen ? 'max-h-[88vh] overflow-y-auto' : 'max-h-20'
        } ${editingRecordId ? 'ring-2 ring-amber-400' : ''}`}>
          
          <div 
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="p-3 flex items-center justify-between cursor-pointer border-b border-slate-100 bg-slate-50/80 rounded-t-3xl select-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-xs font-bold text-slate-800">
                {editingRecordId ? `正在編輯：${targetRecordDate}` : '記錄此刻心情隨筆'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span>{isDrawerOpen ? '收折面板' : '點擊展開'}</span>
              {isDrawerOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
            </div>
          </div>

          <div className="p-4 space-y-3.5">
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-3 rounded-xl cursor-pointer text-xs font-medium border border-slate-200">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>{stagedPhoto ? '更換照片' : '拍下此刻相片'}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              </label>

              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1.5 rounded-xl border border-slate-200">
                <CalendarIcon className="w-3.5 h-3.5 text-blue-500" />
                <input 
                  type="date" 
                  value={targetRecordDate} 
                  onChange={(e) => setTargetRecordDate(e.target.value)} 
                  className="bg-transparent text-xs font-semibold text-slate-700 outline-none w-28" 
                />
              </div>
            </div>

            {stagedPhoto && (
              <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-black/5">
                <div className="relative cursor-crosshair" onClick={handleImageClick}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stagedPhoto.previewUrl} alt="預覽" className="w-full h-40 object-cover" />
                  {stagedPhoto.tags.map((tag) => (
                    <div key={tag.id} style={{ top: `${tag.yPercent}%`, left: `${tag.xPercent}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 bg-black/75 backdrop-blur text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 text-amber-400" />
                      {tag.caption}
                    </div>
                  ))}
                </div>
                {pendingTagPos && (
                  <div className="p-2 bg-white border-t border-slate-200 flex gap-1.5">
                    <input type="text" placeholder="留一句話..." value={tempTagCaption} onChange={(e) => setTempTagCaption(e.target.value)} className="text-xs flex-1 border rounded px-2 py-1 outline-none" autoFocus />
                    <button onClick={addTagToPhoto} className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded">標記</button>
                  </div>
                )}
                <button onClick={() => setStagedPhoto(null)} className="absolute top-2 right-2 bg-white/80 p-1 rounded-full text-rose-600 shadow">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-5 gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              {MOODS.map((m) => {
                const IconComponent = m.icon;
                const isSelected = selectedMood === m.level;
                return (
                  <button
                    key={m.level}
                    type="button"
                    onClick={() => setSelectedMood(m.level)}
                    className={`flex flex-col items-center py-1.5 rounded-lg text-xs ${
                      isSelected ? 'bg-white shadow font-bold scale-105' : 'text-slate-400'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 mb-0.5 ${isSelected ? m.color.split(' ')[0] : ''}`} />
                    <span className="text-[10px]">{m.label}</span>
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              placeholder="留下一句心情隨筆..."
              value={note}
              onFocus={() => setIsDrawerOpen(true)}
              onChange={(e) => setNote(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none bg-slate-50"
            />

            <div className="flex gap-2 pb-1">
              {editingRecordId && (
                <button type="button" onClick={handleCancelEdit} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold">
                  取消
                </button>
              )}
              <button
                onClick={handleSubmit}
                className={`flex-1 text-white py-2 rounded-xl flex items-center justify-center gap-1.5 shadow text-xs font-semibold ${
                  editingRecordId ? 'bg-amber-600' : 'bg-blue-600'
                }`}
              >
                {editingRecordId ? <><Check className="w-3.5 h-3.5" /> 儲存修改</> : <><Send className="w-3.5 h-3.5" /> 儲存記錄</>}
              </button>
            </div>
          </div>
        </section>

      </div>

      {/* ──────────────── 🐞 診斷日誌彈窗 (Modal) ──────────────── */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden font-mono">
            {/* 標題列 */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">系統診斷日誌 ({debugLogs.length} 筆)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyLogs}
                  className="p-1 px-2 rounded-lg bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 text-[11px] flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> 複製
                </button>
                <button
                  onClick={() => setDebugLogs([])}
                  className="p-1 px-2 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 text-[11px] flex items-center gap-1"
                >
                  <Trash className="w-3 h-3" /> 清空
                </button>
                <button
                  onClick={() => setShowLogModal(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 日誌內容串流 */}
            <div className="p-3.5 overflow-y-auto flex-1 space-y-1.5 text-[11px] text-slate-300 select-text">
              {debugLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">目前尚無除錯日誌</div>
              ) : (
                debugLogs.map((log, i) => (
                  <div 
                    key={i} 
                    className={`leading-relaxed break-all ${
                      log.includes('❌') 
                        ? 'text-rose-400 font-semibold' 
                        : log.includes('⚠️') 
                        ? 'text-amber-300' 
                        : log.includes('✅') 
                        ? 'text-emerald-400' 
                        : 'text-slate-300'
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>

            {/* 視窗底欄 */}
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between">
              <span>MindLog Debugger</span>
              <span>{APP_VERSION}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}