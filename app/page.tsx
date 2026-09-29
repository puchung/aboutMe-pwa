'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import imageCompression from 'browser-image-compression';
import { 
  Smile, Frown, Meh, Laugh, Angry, 
  Camera, MapPin, Send, Trash2, Calendar as CalendarIcon, 
  Clock, Edit3, X, ChevronLeft, ChevronRight, RotateCcw, Check,
  Tag, ChevronUp, ChevronDown, Plus, Image as ImageIcon, RotateCcw as ResetIcon, Upload,
  Cloud, CloudOff, RefreshCw, Bug, Copy, Trash, Settings
} from 'lucide-react';
import { db, MoodRecord, PhotoData, PhotoTag } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const APP_VERSION = 'Ver. 001.008.005';
const DEFAULT_TITLE = 'MindLog';
const SYNC_ROW_ID = 'user_mindlog_store';

interface CategoryOption {
  id: string;
  label: string;
  icon: string;
  tagColor: string;
  isCustom?: boolean;
}

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: 'daily', label: '日常隨筆', icon: '🌱', tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'work', label: '工作學習', icon: '💼', tagColor: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'travel', label: '旅行美食', icon: '✈️', tagColor: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'idea', label: '靈感想法', icon: '💡', tagColor: 'bg-purple-50 text-purple-700 border-purple-200' },
];

const MOODS: { level: 1 | 2 | 3 | 4 | 5; label: string; icon: any; color: string }[] = [
  { level: 5, label: '雀躍', icon: Laugh, color: 'text-amber-500 hover:bg-amber-50' },
  { level: 4, label: '愉快', icon: Smile, color: 'text-emerald-500 hover:bg-emerald-50' },
  { level: 3, label: '平靜', icon: Meh, color: 'text-blue-500 hover:bg-blue-50' },
  { level: 2, label: '焦慮', icon: Frown, color: 'text-orange-500 hover:bg-orange-50' },
  { level: 1, label: '低落', icon: Angry, color: 'text-rose-500 hover:bg-rose-50' },
];

interface HeaderConfig {
  title: string;
  bgImageUrl: string | null;
  avatarUrl: string | null;
}

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

  // ⚙️ 系統與外觀設定彈窗
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const appendLog = (msg: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const logItem = `[${timeStr}] ${msg}`;
    console.log(logItem);
    setDebugLogs((prev) => [logItem, ...prev.slice(0, 60)]);
  };

  // ☁️ 雲端同步狀態
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');

  // 🌿 標題、封面與頭像設定
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>({
    title: DEFAULT_TITLE,
    bgImageUrl: null,
    avatarUrl: null,
  });
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [tempTitle, setTempTitle] = useState(DEFAULT_TITLE);
  
  const headerFileRef = useRef<HTMLInputElement>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  // 🏷️ 分類狀態管理
  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string>('daily');

  // 手機抽屜展開/收折
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [note, setNote] = useState('');
  const [stagedPhoto, setStagedPhoto] = useState<PhotoData | null>(null);
  const [tempTagCaption, setTempTagCaption] = useState('');
  const [pendingTagPos, setPendingTagPos] = useState<{ x: number; y: number } | null>(null);

  // 📅 記錄日期
  const [targetRecordDate, setTargetRecordDate] = useState<string>(todayStr);

  // 📝 編輯狀態
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);

  // 🔍 篩選狀態 (日期 + 分類)
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // 1. 初次載入與 Supabase 雲端資料同步
  useEffect(() => {
    appendLog(`系統初始化啟動: ${APP_VERSION}`);

    const savedHeader = localStorage.getItem('mindlog_header_config');
    if (savedHeader) {
      try {
        const parsed = JSON.parse(savedHeader);
        setHeaderConfig(parsed);
        setTempTitle(parsed.title || DEFAULT_TITLE);
        appendLog(`本地 Header 快取載入: [${parsed.title}], 封面=${parsed.bgImageUrl ? `有(${Math.round(parsed.bgImageUrl.length / 1024)}KB)` : '無'}`);
      } catch (e) {
        appendLog(`讀取本地 Header 失敗: ${e}`);
      }
    }

    const savedCats = localStorage.getItem('mindlog_custom_categories');
    if (savedCats) {
      try {
        const parsedCats = JSON.parse(savedCats);
        if (Array.isArray(parsedCats) && parsedCats.length > 0) {
          setCategories(parsedCats);
        }
      } catch (e) {}
    }

    const pullFromCloud = async () => {
      try {
        setSyncStatus('syncing');
        appendLog('開始自 Supabase 拉取最新備份...');
        const { data, error } = await supabase
          .from('mindlog_sync')
          .select('*')
          .eq('id', SYNC_ROW_ID)
          .single();

        if (error && error.code !== 'PGRST116') {
          appendLog(`⚠️ Supabase 查詢警報: ${error.message} (代碼: ${error.code})`);
          setSyncStatus('synced');
          return;
        }

        if (data) {
          appendLog(`✅ Supabase 連線成功，雲端更新時間: ${data.updated_at || '未知'}`);
          if (data.settings) {
            const cloudSettings: HeaderConfig = {
              title: data.settings.title || DEFAULT_TITLE,
              avatarUrl: data.settings.avatarUrl || null,
              bgImageUrl: data.settings.bgImageUrl || null,
            };
            setHeaderConfig(cloudSettings);
            setTempTitle(cloudSettings.title);
            localStorage.setItem('mindlog_header_config', JSON.stringify(cloudSettings));
            appendLog(`封面狀態: ${cloudSettings.bgImageUrl ? `已成功拉取 (約 ${Math.round(cloudSettings.bgImageUrl.length / 1024)} KB)` : '雲端無封面'}`);

            if (data.settings.customCategories && Array.isArray(data.settings.customCategories)) {
              setCategories(data.settings.customCategories);
              localStorage.setItem('mindlog_custom_categories', JSON.stringify(data.settings.customCategories));
            }
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
            appendLog(`成功同步隨筆: 共 ${cloudRecords.length} 篇`);
          }
        } else {
          appendLog('雲端無備份資料');
        }
        setSyncStatus('synced');
      } catch (err: any) {
        appendLog(`❌ 雲端拉取異常: ${err?.message || err}`);
        setSyncStatus('error');
      }
    };

    pullFromCloud();
  }, []);

  // 2. 將設定與資料推送到 Supabase
  const pushToCloud = async (newSettings?: HeaderConfig, newCategories?: CategoryOption[]) => {
    try {
      setSyncStatus('syncing');
      const curSettings = newSettings || headerConfig;
      const curCategories = newCategories || categories;
      appendLog(`推送至 Supabase: 封面=${curSettings.bgImageUrl ? `包含 (${Math.round(curSettings.bgImageUrl.length / 1024)} KB)` : '無'}`);

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

      const payloadSettings = {
        ...curSettings,
        customCategories: curCategories,
      };

      const { error } = await supabase.from('mindlog_sync').upsert({
        id: SYNC_ROW_ID,
        settings: payloadSettings,
        entries: serializableEntries,
        updated_at: new Date().toISOString()
      });

      if (error) {
        appendLog(`❌ Supabase 寫入失敗: ${error.message} (代碼: ${error.code})`);
        throw error;
      }

      appendLog('✅ Supabase 同步成功！封面與分類已更新');
      setSyncStatus('synced');
    } catch (err: any) {
      appendLog(`❌ 同步拋出例外: ${err?.message || err}`);
      setSyncStatus('error');
    }
  };

  const saveHeaderConfig = async (newConfig: HeaderConfig) => {
    setHeaderConfig(newConfig);
    localStorage.setItem('mindlog_header_config', JSON.stringify(newConfig));
    await pushToCloud(newConfig);
  };

  // 🖼️ 封面圖片選取與壓縮
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      appendLog(`選取封面: ${file.name} (${Math.round(file.size / 1024)} KB)，壓縮中...`);
      const options = { maxSizeMB: 0.15, maxWidthOrHeight: 1280, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      appendLog(`封面壓縮完成: 縮減至 ${Math.round(compressedBlob.size / 1024)} KB`);

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const updated: HeaderConfig = { ...headerConfig, bgImageUrl: base64data };
        await saveHeaderConfig(updated);
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err: any) {
      appendLog(`❌ 封面壓縮錯誤: ${err?.message || err}`);
    }
  };

  // 👤 頭像上傳
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      appendLog(`選取頭像照片: ${file.name}`);
      const options = { maxSizeMB: 0.08, maxWidthOrHeight: 256, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const updated: HeaderConfig = { ...headerConfig, avatarUrl: base64data };
        await saveHeaderConfig(updated);
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err: any) {
      appendLog(`❌ 頭像壓縮失敗: ${err?.message || err}`);
    }
  };

  const handleResetHeader = async () => {
    if (window.confirm('確定要還原預設外觀嗎？此設定將同步至所有裝置。')) {
      const defConfig: HeaderConfig = { title: DEFAULT_TITLE, bgImageUrl: null, avatarUrl: null };
      setTempTitle(DEFAULT_TITLE);
      setIsEditingHeader(false);
      appendLog('已執行外觀還原');
      await saveHeaderConfig(defConfig);
    }
  };

  const handleSaveTitle = async () => {
    const newTitle = tempTitle.trim() || DEFAULT_TITLE;
    const updated: HeaderConfig = { ...headerConfig, title: newTitle };
    setIsEditingHeader(false);
    await saveHeaderConfig(updated);
  };

  const persistCategories = async (newCats: CategoryOption[]) => {
    setCategories(newCats);
    localStorage.setItem('mindlog_custom_categories', JSON.stringify(newCats));
    await pushToCloud(undefined, newCats);
  };

  const handleAddNewCategory = () => {
    const name = window.prompt('請輸入新分類名稱 (例如：閱讀、健身、理財)：');
    if (!name || !name.trim()) return;

    const trimmed = name.trim();
    if (categories.some((c) => c.label === trimmed)) {
      alert('已有相同名稱的分類！');
      return;
    }

    const newCat: CategoryOption = {
      id: `custom_${Date.now()}`,
      label: trimmed,
      icon: '📌',
      tagColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      isCustom: true,
    };

    const updated = [...categories, newCat];
    persistCategories(updated);
    setSelectedCategory(newCat.id);
  };

  const handleDeleteCategory = (catId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('確定要刪除此分類嗎？既有已套用的日記將自動歸入日常隨筆。')) {
      const updated = categories.filter((c) => c.id !== catId);
      persistCategories(updated);
      if (selectedCategory === catId) setSelectedCategory('daily');
      if (filterCategory === catId) setFilterCategory('all');
    }
  };

  const entries = useLiveQuery(async () => {
    let list: (MoodRecord & { category?: string })[] = [];
    if (filterDate) {
      list = await db.records.where('dateStr').equals(filterDate).reverse().sortBy('timestamp');
    } else {
      list = await db.records.orderBy('timestamp').reverse().toArray();
    }

    if (filterCategory !== 'all') {
      list = list.filter((item) => ((item as any).category || 'daily') === filterCategory);
    }
    return list;
  }, [filterDate, filterCategory]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
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
    } catch (err: any) {
      appendLog(`❌ 隨筆照片壓縮失敗: ${err?.message || err}`);
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
  };

  const handleSubmit = async () => {
    if (!note.trim() && !stagedPhoto) {
      alert('請先輸入文字或拍照！');
      return;
    }

    const moodObj = MOODS.find((m) => m.level === selectedMood)!;
    const assignedDate = new Date(`${targetRecordDate}T12:00:00`);
    const dateStr = targetRecordDate;

    if (editingRecordId) {
      await db.records.update(editingRecordId, {
        dateStr,
        category: selectedCategory,
        moodLevel: selectedMood,
        moodLabel: moodObj.label,
        note: note.trim(),
        photos: stagedPhoto ? [stagedPhoto] : [],
        updatedAt: Date.now(),
      });
      setEditingRecordId(null);
    } else {
      const newRecord: MoodRecord = {
        timestamp: assignedDate.getTime(),
        dateStr,
        category: selectedCategory,
        moodLevel: selectedMood,
        moodLabel: moodObj.label,
        note: note.trim(),
        photos: stagedPhoto ? [stagedPhoto] : [],
        createdAt: assignedDate.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', weekday: 'short' }),
        appVersion: APP_VERSION
      };
      await db.records.add(newRecord);
    }

    setNote('');
    setStagedPhoto(null);
    setPendingTagPos(null);
    setTargetRecordDate(filterDate || todayStr);
    setSelectedCategory('daily');
    setIsDrawerOpen(false);

    await pushToCloud();
  };

  const handleStartEdit = (record: MoodRecord & { category?: string }) => {
    setEditingRecordId(record.id!);
    setSelectedCategory(record.category || 'daily');
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingRecordId(null);
    setNote('');
    setStagedPhoto(null);
    setPendingTagPos(null);
    setTargetRecordDate(filterDate || todayStr);
    setSelectedCategory('daily');
    setIsDrawerOpen(false);
  };

  const handleDelete = async (record: MoodRecord) => {
    if (window.confirm(`確定要刪除 ${record.dateStr} 的這篇隨筆嗎？此動作將同步抹除雲端備份。`)) {
      if (record.id) {
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

  // 🌿 橫幅封面元件：右上角功能全面收納至純 ⚙️ 齒輪 ICON
  const renderHeaderBanner = (isMobile = false) => {
    const hasBg = !!headerConfig.bgImageUrl;

    return (
      <div 
        className={`relative overflow-hidden transition-all duration-300 ${
          isMobile 
            ? 'w-full h-36 md:hidden' 
            : 'w-full rounded-2xl mb-5 shadow-sm md:min-h-[190px]'
        } ${!hasBg ? 'bg-gradient-to-r from-slate-900 to-slate-800 text-white' : ''}`}
        style={hasBg ? {
          backgroundImage: `url(${headerConfig.bgImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}}
      >
        {/* 對比度保護暗色漸層遮罩 */}
        {hasBg && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20 md:from-black/80 md:via-black/25 md:to-black/10 pointer-events-none" />
        )}

        <div className={`relative z-10 flex flex-col justify-between h-full p-4 ${isMobile ? 'h-36' : 'min-h-[130px] md:min-h-[190px]'}`}>
          
          {/* 上排功能鍵：左側留白，右側僅放雲端狀態燈與純 ⚙️ 齒輪按鈕 */}
          <div className="flex items-center justify-between">
            <div />

            <div className="flex items-center gap-1.5">
              {/* 雲端同步狀態燈 */}
              <div className="bg-black/40 backdrop-blur-sm border border-white/15 p-1.5 rounded-xl">
                {syncStatus === 'syncing' && (
                  <div title="雲端同步中...">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  </div>
                )}
                {syncStatus === 'synced' && (
                  <div title="☁️ 雲端已即時同步">
                    <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                )}
                {syncStatus === 'error' && (
                  <div title="❌ 雲端同步異常">
                    <CloudOff className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                )}
              </div>

              {/* ⚙️ 齒輪設定按鈕 (純 ICON，無文字) */}
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="p-1.5 rounded-xl bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm border border-white/15 transition-all shadow-sm active:scale-95"
                title="系統與外觀設定"
              >
                <Settings className="w-4 h-4 text-slate-200" />
              </button>
            </div>
          </div>

          {/* 下排：使用者頭像與標題文字 */}
          <div className="mt-auto">
            {!isEditingHeader ? (
              <div className="flex items-center justify-between group">
                <div 
                  onClick={() => {
                    setTempTitle(headerConfig.title);
                    setIsEditingHeader(true);
                  }}
                  className="flex items-center gap-2.5 md:gap-3.5 cursor-pointer select-none"
                  title="點擊修改日記名稱"
                >
                  {/* 使用者自訂頭像 (點擊頭像本身亦可快速換頭像) */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      avatarFileRef.current?.click();
                    }}
                    className="relative group/avatar cursor-pointer shrink-0"
                    title="點擊更換頭像"
                  >
                    {headerConfig.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={headerConfig.avatarUrl} 
                        alt="User Avatar" 
                        className="w-10 h-10 md:w-14 md:h-14 rounded-full md:rounded-2xl object-cover border-2 border-white/90 shadow-md md:shadow-lg transition-transform group-hover/avatar:scale-105" 
                      />
                    ) : (
                      <div className="w-10 h-10 md:w-14 md:h-14 rounded-full md:rounded-2xl bg-white/20 backdrop-blur border border-white/40 flex items-center justify-center text-lg md:text-2xl shadow-md md:shadow-lg transition-transform group-hover/avatar:scale-105">
                        🌿
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <h1 className="text-xl md:text-2xl font-black tracking-tight text-white drop-shadow-md">
                      {headerConfig.title}
                    </h1>
                    <Edit3 className="w-3.5 h-3.5 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                <span className="text-xs text-white/80 font-medium drop-shadow">
                  共 {entries?.length || 0} 篇
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md p-1.5 rounded-xl border border-white/20">
                <input
                  type="text"
                  maxLength={15}
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  placeholder="輸入自訂標題..."
                  className="bg-transparent text-sm font-bold text-white outline-none w-full px-1"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingHeader(false)}
                  className="p-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  };

  const renderEditorForm = () => (
    <div className="space-y-4">
      {editingRecordId && (
        <div className="bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs">
          <span className="font-semibold flex items-center gap-1">
            <Edit3 className="w-3.5 h-3.5 text-amber-600" /> 正在編輯 {targetRecordDate} 的記事
          </span>
          <button onClick={handleCancelEdit} className="text-amber-700 hover:text-amber-900 p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            記錄日期 (可補登)
          </label>
          {targetRecordDate !== todayStr && (
            <button
              type="button"
              onClick={() => setTargetRecordDate(todayStr)}
              className="text-[11px] text-blue-600 hover:underline"
            >
              切換為今天
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <CalendarIcon className="w-4 h-4 text-blue-500 ml-1" />
          <input
            type="date"
            value={targetRecordDate}
            onChange={(e) => setTargetRecordDate(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-800 outline-none w-full cursor-pointer"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            記事分類
          </label>
          <button
            type="button"
            onClick={handleAddNewCategory}
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> 自訂新分類
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition border flex items-center gap-1 group ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-semibold scale-105'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                {cat.isCustom && (
                  <span
                    onClick={(e) => handleDeleteCategory(cat.id, e)}
                    className="ml-0.5 opacity-60 hover:opacity-100 text-slate-400 hover:text-rose-500"
                    title="刪除此分類"
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">當日心情</label>
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
                  isSelected ? 'bg-white shadow text-slate-900 font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <IconComponent className={`w-4 h-4 mb-0.5 ${isSelected ? m.color.split(' ')[0] : ''}`} />
                <span className="text-[10px]">{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">相片紀錄</label>
        {!stagedPhoto ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-3.5 cursor-pointer hover:border-blue-400 bg-slate-50 transition-colors">
            <Camera className="w-5 h-5 text-slate-400 mb-1" />
            <span className="text-xs text-slate-500">拍下相片或上傳</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
          </label>
        ) : (
          <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-black/5">
            <div className="relative cursor-crosshair" onClick={handleImageClick}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stagedPhoto.previewUrl} alt="預覽" className="w-full h-40 object-cover select-none" />
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
      </div>

      <div>
        <textarea
          rows={3}
          placeholder="記錄該日的心情隨筆..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none bg-slate-50"
        />
      </div>

      <div className="flex gap-2 pb-1">
        {editingRecordId && (
          <button type="button" onClick={handleCancelEdit} className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-semibold">
            取消
          </button>
        )}
        <button
          onClick={handleSubmit}
          className={`flex-1 text-white py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow text-xs font-semibold ${
            editingRecordId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {editingRecordId ? <><Check className="w-3.5 h-3.5" /> 儲存修改</> : <><Send className="w-3.5 h-3.5" /> 儲存記錄至 {targetRecordDate}</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col md:flex-row">
      
      {/* 隱藏的原生 File Inputs，供彈窗觸發 */}
      <input ref={headerFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {/* ──────────────── 💻 PC 端左側固定面板 ──────────────── */}
      <aside className="hidden md:flex w-96 md:w-[410px] bg-white border-r border-slate-200 p-5 flex-col justify-between shrink-0 shadow-sm h-screen sticky top-0 overflow-y-auto">
        <div>
          {renderHeaderBanner(false)}
          {renderEditorForm()}
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>PC / 手機自適應架構</span>
          <span>共 {entries?.length || 0} 篇</span>
        </div>
      </aside>

      {/* ──────────────── 📱+💻 主時間軸區塊 ──────────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        
        {renderHeaderBanner(true)}

        <main className="flex-1 max-w-2xl md:max-w-4xl mx-auto w-full p-4 md:p-8 pb-36 md:pb-8">
          
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm mb-5 space-y-3">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
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

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 font-medium whitespace-nowrap mr-1 flex items-center gap-1">
                <Tag className="w-3 h-3" /> 分類:
              </span>
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition border ${
                  filterCategory === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                全部
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition border flex items-center gap-1 ${
                    filterCategory === cat.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" /> 
              {filterDate ? `指定日期：${filterDate}` : '隨筆時間軸'}
              {filterCategory !== 'all' && (
                <span className="text-xs font-normal text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-full">
                  {categories.find((c) => c.id === filterCategory)?.label}
                </span>
              )}
            </h2>
          </div>

          <div className="space-y-4">
            {entries?.map((record) => {
              const mood = MOODS.find((m) => m.level === record.moodLevel);
              const categoryObj = categories.find((c) => c.id === ((record as any).category || 'daily')) || categories[0];
              const Icon = mood?.icon || Meh;
              const isEditing = editingRecordId === record.id;

              return (
                <article 
                  key={record.id} 
                  className={`bg-white rounded-2xl p-5 border transition-all shadow-sm ${
                    isEditing ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg bg-slate-50 ${mood?.color.split(' ')[0]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{record.moodLabel}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-0.5 ${categoryObj?.tagColor || 'bg-slate-100 text-slate-600'}`}>
                        <span>{categoryObj?.icon || '📌'}</span>
                        <span>{categoryObj?.label || '未分類'}</span>
                      </span>

                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {record.dateStr}
                      </span>
                      <button onClick={() => handleStartEdit(record)} className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition" title="編輯此記事">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(record)} className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition" title="刪除此記事">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {record.photos && record.photos.length > 0 && record.photos[0].blob && (
                    <div className="relative rounded-xl overflow-hidden mb-3 border border-slate-100 bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(record.photos[0].blob)} alt="記錄照片" className="w-full max-h-96 object-cover" />
                      {record.photos[0].tags?.map((tag) => (
                        <div key={tag.id} style={{ top: `${tag.yPercent}%`, left: `${tag.xPercent}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 bg-black/70 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full shadow-lg border border-white/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {tag.caption}
                        </div>
                      ))}
                    </div>
                  )}

                  {record.note && (
                    <p className="text-sm md:text-[15px] text-slate-700 leading-relaxed whitespace-pre-line">
                      {record.note}
                    </p>
                  )}

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>紀錄日期：{record.dateStr}{record.updatedAt && ' (已編輯)'}</span>
                    <span>歸檔完整</span>
                  </div>
                </article>
              );
            })}

            {(!entries || entries.length === 0) && (
              <div className="text-center py-16 text-slate-400 border border-dashed rounded-2xl bg-white/50">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {filterDate || filterCategory !== 'all' ? '目前篩選條件下尚無任何心情記錄' : '尚無心情紀錄，隨時開始記錄此刻！'}
                </p>
              </div>
            )}
          </div>

          <footer className="mt-12 mb-4 text-center">
            <span className="inline-block text-[11px] font-mono text-slate-400 bg-slate-200/60 border border-slate-200 px-3 py-1 rounded-full shadow-sm">
              MindLog PWA · {APP_VERSION}
            </span>
          </footer>

        </main>

        <section className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-all duration-300 rounded-t-3xl max-w-2xl mx-auto ${
          isDrawerOpen ? 'max-h-[85vh] overflow-y-auto' : 'max-h-20'
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

          <div className="p-4">
            {renderEditorForm()}
          </div>
        </section>

      </div>

      {/* ──────────────── ⚙️ 系統與外觀設定彈窗 (Settings Modal) ──────────────── */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden font-sans">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-200">
                <Settings className="w-4 h-4 text-slate-400" />
                <span>畫面與系統設定</span>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-2 text-xs">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  headerFileRef.current?.click();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700/50 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span>更換封面背景相片</span>
              </button>

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  avatarFileRef.current?.click();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700/50 transition-colors"
              >
                <Upload className="w-4 h-4 text-blue-400" />
                <span>更換個人專屬頭像</span>
              </button>

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowLogModal(true);
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700/50 transition-colors"
              >
                <Bug className="w-4 h-4 text-amber-400" />
                <span>查看系統診斷日誌</span>
              </button>

              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  handleResetHeader();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors"
              >
                <ResetIcon className="w-4 h-4 text-rose-400" />
                <span>還原預設外觀與封面</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── 🐞 診斷日誌彈窗 ──────────────── */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden font-mono">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">系統診斷日誌 ({debugLogs.length} 筆)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(debugLogs.join('\n'));
                    alert('已複製日誌');
                  }}
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
                <button onClick={() => setShowLogModal(false)} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-3.5 overflow-y-auto flex-1 space-y-1.5 text-[11px] text-slate-300 select-text">
              {debugLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">目前尚無除錯日誌</div>
              ) : (
                debugLogs.map((log, i) => (
                  <div key={i} className={`leading-relaxed break-all ${log.includes('❌') ? 'text-rose-400 font-semibold' : log.includes('✅') ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {log}
                  </div>
                ))
              )}
            </div>
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between">
              <span>MindLog Diagnostic Logs</span>
              <span>{APP_VERSION}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}