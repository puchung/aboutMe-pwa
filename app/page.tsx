'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import imageCompression from 'browser-image-compression';
import { 
  Smile, Frown, Meh, Laugh, Angry, 
  Camera, MapPin, Send, Trash2, Calendar as CalendarIcon, 
  Clock, Edit3, X, ChevronLeft, ChevronRight, RotateCcw, Check,
  Tag, ChevronUp, ChevronDown, Plus, Image as ImageIcon, RotateCcw as ResetIcon, Settings
} from 'lucide-react';
import { db, MoodRecord, PhotoData, PhotoTag } from '@/lib/db';

const APP_VERSION = 'Ver. 001.006.000';
const DEFAULT_TITLE = 'MindLog';

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
}

export default function MindLogPage() {
  const todayStr = new Date().toISOString().split('T')[0];

  // 🌿 Title 與背景封面設定
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>({
    title: DEFAULT_TITLE,
    bgImageUrl: null,
  });
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [tempTitle, setTempTitle] = useState(DEFAULT_TITLE);
  const headerFileRef = useRef<HTMLInputElement>(null);

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

  // 📅 新增/編輯所指定的記錄日期
  const [targetRecordDate, setTargetRecordDate] = useState<string>(todayStr);

  // 📝 編輯狀態管理
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);

  // 🔍 篩選狀態管理 (日期 + 分類)
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // 載入本地儲存之 Header 設定與自訂分類
  useEffect(() => {
    const savedHeader = localStorage.getItem('mindlog_header_config');
    if (savedHeader) {
      try {
        const parsed = JSON.parse(savedHeader);
        setHeaderConfig(parsed);
        setTempTitle(parsed.title || DEFAULT_TITLE);
      } catch (e) {
        console.error('讀取 Header 設定失敗:', e);
      }
    }

    const savedCats = localStorage.getItem('mindlog_custom_categories');
    if (savedCats) {
      try {
        const parsedCats = JSON.parse(savedCats);
        if (Array.isArray(parsedCats) && parsedCats.length > 0) {
          setCategories(parsedCats);
        }
      } catch (e) {
        console.error('讀取自訂分類失敗:', e);
      }
    }
  }, []);

  // 儲存 Title 與封面相片設定
  const saveHeaderConfig = (newConfig: HeaderConfig) => {
    setHeaderConfig(newConfig);
    localStorage.setItem('mindlog_header_config', JSON.stringify(newConfig));
  };

  // 更換封面相片
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = { maxSizeMB: 0.4, maxWidthOrHeight: 1280, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        saveHeaderConfig({ ...headerConfig, bgImageUrl: base64data });
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err) {
      console.error('封面照片壓縮失敗:', err);
    }
  };

  // 還原預設 Title 與封面
  const handleResetHeader = () => {
    if (window.confirm('確定要還原預設標題與純色背景嗎？')) {
      const defConfig: HeaderConfig = { title: DEFAULT_TITLE, bgImageUrl: null };
      setTempTitle(DEFAULT_TITLE);
      saveHeaderConfig(defConfig);
      setIsEditingHeader(false);
    }
  };

  // 儲存文字標題修改
  const handleSaveTitle = () => {
    const newTitle = tempTitle.trim() || DEFAULT_TITLE;
    saveHeaderConfig({ ...headerConfig, title: newTitle });
    setIsEditingHeader(false);
  };

  // 儲存自訂分類
  const persistCategories = (newCats: CategoryOption[]) => {
    setCategories(newCats);
    localStorage.setItem('mindlog_custom_categories', JSON.stringify(newCats));
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

  // 即時讀取日記清單 (日期與分類雙重交集查詢)
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

  // 照片壓縮
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1600, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressedBlob);

      setStagedPhoto({
        id: crypto.randomUUID(),
        blob: compressedBlob,
        previewUrl,
        tags: []
      });
      setIsDrawerOpen(true);
    } catch (err) {
      console.error('照片壓縮失敗:', err);
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
    if (!note.trim() && !stagedPhoto) return;

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
    if (window.confirm(`確定要刪除 ${record.dateStr} 的這篇隨筆嗎？`)) {
      if (record.id) {
        await db.records.delete(record.id);
        if (editingRecordId === record.id) {
          handleCancelEdit();
        }
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

  // 🌿 橫幅封面元件（含文字自訂、相片上傳與對比度遮罩）
  const renderHeaderBanner = (isMobile = false) => {
    const hasBg = !!headerConfig.bgImageUrl;

    return (
      <div 
        className={`relative overflow-hidden transition-all duration-300 ${
          isMobile 
            ? 'w-full h-32 md:hidden' 
            : 'w-full rounded-2xl mb-5 shadow-sm'
        } ${!hasBg ? 'bg-gradient-to-r from-slate-900 to-slate-800 text-white' : ''}`}
        style={hasBg ? {
          backgroundImage: `url(${headerConfig.bgImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}}
      >
        {/* 對比度保護暗色漸層遮罩 */}
        {hasBg && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/30 pointer-events-none" />
        )}

        {/* 橫幅內容 */}
        <div className={`relative z-10 flex flex-col justify-between h-full p-4 ${isMobile ? 'h-32' : 'min-h-[120px]'}`}>
          {/* 上排功能鍵：自訂 Title & 更換相片 */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest uppercase bg-black/40 backdrop-blur-sm text-slate-200 px-2 py-0.5 rounded-full border border-white/10">
              {APP_VERSION}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => headerFileRef.current?.click()}
                className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm border border-white/15 transition-all text-xs flex items-center gap-1"
                title="上傳自訂背景相片"
              >
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] hidden sm:inline">換封面</span>
              </button>
              <input 
                ref={headerFileRef} 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleCoverUpload} 
              />

              {hasBg && (
                <button
                  type="button"
                  onClick={handleResetHeader}
                  className="p-1.5 rounded-lg bg-black/40 hover:bg-rose-900/60 text-white backdrop-blur-sm border border-white/15 transition-all"
                  title="還原預設底色"
                >
                  <ResetIcon className="w-3.5 h-3.5 text-slate-300 hover:text-rose-400" />
                </button>
              )}
            </div>
          </div>

          {/* 下排：標題文字（支援就地編輯） */}
          <div className="mt-auto">
            {!isEditingHeader ? (
              <div className="flex items-center justify-between group">
                <div 
                  onClick={() => {
                    setTempTitle(headerConfig.title);
                    setIsEditingHeader(true);
                  }}
                  className="flex items-center gap-2 cursor-pointer"
                  title="點擊修改日記名稱"
                >
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-white drop-shadow-md">
                    🌿 {headerConfig.title}
                  </h1>
                  <Edit3 className="w-3.5 h-3.5 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />
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

  // 表單核心組件（手機抽屜與 PC 側邊欄共用）
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

      {/* 記錄日期 */}
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

      {/* 🏷️ 分類選取與新增 */}
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

      {/* 當日心情刻度 */}
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

      {/* 相片上傳與預覽 */}
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

      {/* 隨筆文字 */}
      <div>
        <textarea
          rows={3}
          placeholder="記錄該日的心情隨筆..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none bg-slate-50"
        />
      </div>

      {/* 送出與取消 */}
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
      
      {/* ──────────────── 💻 PC 端經典左側固定面板 (包含 PC 專屬橫幅) ──────────────── */}
      <aside className="hidden md:flex w-96 bg-white border-r border-slate-200 p-5 flex-col justify-between shrink-0 shadow-sm h-screen sticky top-0 overflow-y-auto">
        <div>
          {/* PC 頂部自訂橫幅 */}
          {renderHeaderBanner(false)}
          {renderEditorForm()}
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>PC / 手機自適應橫幅</span>
          <span>{APP_VERSION}</span>
        </div>
      </aside>

      {/* ──────────────── 📱+💻 主時間軸區塊 (手機滿版橫幅置頂) ──────────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        
        {/* 手機專屬頂部橫幅封面 (置頂滿版) */}
        {renderHeaderBanner(true)}

        {/* 時間軸主要容器 */}
        <main className="flex-1 max-w-2xl mx-auto w-full p-4 md:p-8 pb-36 md:pb-8">
          
          {/* 📅 日期與分類綜合過濾工具列 */}
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm mb-5 space-y-3">
            
            {/* 上排：日期篩選 */}
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

            {/* 下排：分類過濾列 */}
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

          {/* 筆數與狀態標示 */}
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

          {/* 日記卡片列表 */}
          <div className="space-y-4">
            {entries?.map((record) => {
              const mood = MOODS.find((m) => m.level === record.moodLevel);
              const categoryObj = categories.find((c) => c.id === ((record as any).category || 'daily')) || categories[0];
              const Icon = mood?.icon || Meh;
              const isEditing = editingRecordId === record.id;

              return (
                <article 
                  key={record.id} 
                  className={`bg-white rounded-2xl p-4 border transition-all shadow-sm ${
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
                    
                    {/* 分類標籤、日期與編輯按鈕 */}
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

                  {/* 照片與氣泡標籤 */}
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
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {record.note}
                    </p>
                  )}

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>紀錄日期：{record.dateStr}{record.updatedAt && ' (已編輯)'}</span>
                    <span className="font-mono text-[10px] text-slate-300">{record.appVersion}</span>
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
        </main>

        {/* ──────────────── 📱 手機端專屬：吸底拇指常駐抽屜 ──────────────── */}
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
    </div>
  );
}