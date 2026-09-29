'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Trash2, Edit3, RefreshCw, Cloud, CloudOff, 
  DollarSign, Sun, Moon, Bug, BarChart3, PieChart, 
  Copy, Trash, X, ChevronUp, ChevronDown, Check,
  BookOpen, Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw,
  Camera, Image as ImageIcon, FileText, Tag
} from 'lucide-react';
import { getStockPriceWithLog, getUsdExchangeRate, getStockHistory3Mo, HistoryPricePoint } from './actions';
import { createClient } from '@supabase/supabase-js';
import imageCompression from 'browser-image-compression';

// 初始化 Supabase 客戶端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SYNC_ROW_ID = 'user_portfolio_store_v3';
const version = 'v001.09.050';

// 交易介面型別定義
interface Transaction {
  id: string;
  symbol: string;
  fundCode?: string;
  currency: 'TWD' | 'USD';
  status: '庫存' | '賣出' | '除息';
  shares: number;
  price: number;
  exchangeRate: number;
  currentPrice: number;
  date: string;
  soldDate?: string;
  dividendAmount?: number;
}

// 1. 心情（日記）記事型別
interface MoodRecord {
  emoji: string;
  label: string;
  note: string;
  updatedAt: string;
}

interface MoodState {
  [dateStr: string]: MoodRecord;
}

// 2. 研究筆記型別（支援貼圖與標籤）
interface ResearchNote {
  id: string;
  title: string;
  symbol?: string;
  content: string;
  imageBase64?: string;
  createdAt: string;
}

export default function PortfolioPage() {
  const todayStr = new Date().toISOString().split('T')[0];

  // 主題與雲端狀態
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);

  // 核心資料狀態
  const [symbols, setSymbols] = useState<string[]>(['0050', '2330', '安聯台灣大壩']);
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: '1', symbol: '0050', currency: 'TWD', status: '庫存', shares: 1000, price: 150, exchangeRate: 1, currentPrice: 160, date: '2026-01-10' },
  ]);
  const [usdRate, setUsdRate] = useState<number>(32.0);

  // 頁籤切換: 'portfolio' | 'mood' | 'research'
  const [activeTab, setActiveTab] = useState<'portfolio' | 'mood' | 'research'>('portfolio');

  // 📖 1. 心情日記狀態
  const [moodRecords, setMoodRecords] = useState<MoodState>({});
  const [activeMoodDate, setActiveMoodDate] = useState<string>(todayStr);
  const [currentMoodChoice, setCurrentMoodChoice] = useState<{ emoji: string; label: string }>({ emoji: '😐', label: '冷靜觀望' });
  const [currentMoodNote, setCurrentMoodNote] = useState<string>('');

  const MOOD_OPTIONS = [
    { emoji: '😄', label: '信心滿滿' },
    { emoji: '😐', label: '冷靜觀望' },
    { emoji: '😰', label: '焦慮恐慌' },
    { emoji: '🎉', label: '停利落袋' },
    { emoji: '😤', label: '懊悔衝動' },
  ];

  // 📝 2. 研究筆記狀態
  const [researchNotes, setResearchNotes] = useState<ResearchNote[]>([]);
  const [editingNote, setEditingNote] = useState<Partial<ResearchNote> | null>(null);
  const noteImageRef = useRef<HTMLInputElement>(null);

  const appendLog = (msg: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    const logItem = `[${timeStr}] ${msg}`;
    console.log(logItem);
    setDebugLogs((prev) => [logItem, ...prev.slice(0, 60)]);
  };

  // 初始化載入
  useEffect(() => {
    const savedTheme = localStorage.getItem('portfolio_theme') as 'dark' | 'light';
    if (savedTheme) setTheme(savedTheme);

    const savedMoods = localStorage.getItem('portfolio_moods');
    if (savedMoods) { try { setMoodRecords(JSON.parse(savedMoods)); } catch(e){} }

    const savedNotes = localStorage.getItem('portfolio_research_notes');
    if (savedNotes) { try { setResearchNotes(JSON.parse(savedNotes)); } catch(e){} }

    const pullCloud = async () => {
      try {
        setSyncStatus('syncing');
        appendLog('正在從 Supabase 雲端同步資料...');
        const { data, error } = await supabase.from('mindlog_sync').select('*').eq('id', SYNC_ROW_ID).single();
        if (data) {
          if (data.entries?.symbols) setSymbols(data.entries.symbols);
          if (data.entries?.transactions) setTransactions(data.entries.transactions);
          if (data.entries?.moodRecords) {
            setMoodRecords(data.entries.moodRecords);
            localStorage.setItem('portfolio_moods', JSON.stringify(data.entries.moodRecords));
          }
          if (data.entries?.researchNotes) {
            setResearchNotes(data.entries.researchNotes);
            localStorage.setItem('portfolio_research_notes', JSON.stringify(data.entries.researchNotes));
          }
          if (data.settings?.usdRate) setUsdRate(data.settings.usdRate);
          appendLog('✅ 成功自 Supabase 雲端同步資料');
        }
        setSyncStatus('synced');
      } catch (e: any) {
        appendLog(`⚠️ 雲端同步異常: ${e?.message || e}`);
        setSyncStatus('error');
      }
    };
    pullCloud();
  }, []);

  // 即時雲端儲存
  const saveToCloudImmediately = async (newTx = transactions, newSyms = symbols, newMoods = moodRecords, newNotes = researchNotes) => {
    try {
      setSyncStatus('syncing');
      localStorage.setItem('portfolio_transactions', JSON.stringify(newTx));
      localStorage.setItem('portfolio_symbols', JSON.stringify(newSyms));
      localStorage.setItem('portfolio_moods', JSON.stringify(newMoods));
      localStorage.setItem('portfolio_research_notes', JSON.stringify(newNotes));

      const { error } = await supabase.from('mindlog_sync').upsert({
        id: SYNC_ROW_ID,
        settings: { usdRate },
        entries: { symbols: newSyms, transactions: newTx, moodRecords: newMoods, researchNotes: newNotes },
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setSyncStatus('synced');
      appendLog('雲端已成功即時同步');
    } catch (e: any) {
      appendLog(`❌ 雲端儲存失敗: ${e?.message || e}`);
      setSyncStatus('error');
    }
  };

  // 切換日記日期時載入對應內容
  useEffect(() => {
    const record = moodRecords[activeMoodDate];
    if (record) {
      setCurrentMoodChoice({ emoji: record.emoji, label: record.label });
      setCurrentMoodNote(record.note || '');
    } else {
      setCurrentMoodChoice({ emoji: '😐', label: '冷靜觀望' });
      setCurrentMoodNote('');
    }
  }, [activeMoodDate, moodRecords]);

  const handleSaveMood = () => {
    const updated = {
      ...moodRecords,
      [activeMoodDate]: {
        emoji: currentMoodChoice.emoji,
        label: currentMoodChoice.label,
        note: currentMoodNote.trim(),
        updatedAt: new Date().toISOString()
      }
    };
    setMoodRecords(updated);
    saveToCloudImmediately(transactions, symbols, updated, researchNotes);
    appendLog(`✅ 已儲存 ${activeMoodDate} 的心態日記 [${currentMoodChoice.label}]`);
    alert('心態日記儲存成功！');
  };

  // 處理研究筆記圖片上傳與壓縮
  const handleNoteImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true };
      const compressedBlob = await imageCompression(file, options);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingNote(prev => prev ? { ...prev, imageBase64: reader.result as string } : { imageBase64: reader.result as string });
        appendLog('研究筆記圖片壓縮並載入成功');
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err: any) {
      appendLog(`❌ 圖片壓縮失敗: ${err.message}`);
    }
  };

  const handleSaveResearchNote = () => {
    if (!editingNote || !editingNote.title?.trim()) {
      alert('請至少填寫筆記標題！');
      return;
    }
    const noteItem: ResearchNote = {
      id: editingNote.id || crypto.randomUUID(),
      title: editingNote.title.trim(),
      symbol: editingNote.symbol?.trim() || '',
      content: editingNote.content?.trim() || '',
      imageBase64: editingNote.imageBase64 || '',
      createdAt: editingNote.createdAt || new Date().toLocaleString()
    };

    const updatedNotes = editingNote.id 
      ? researchNotes.map(n => n.id === noteItem.id ? noteItem : n)
      : [noteItem, ...researchNotes];

    setResearchNotes(updatedNotes);
    saveToCloudImmediately(transactions, symbols, moodRecords, updatedNotes);
    setEditingNote(null);
    appendLog(`✅ 已儲存研究筆記: ${noteItem.title}`);
  };

  const handleDeleteResearchNote = (id: string) => {
    if (confirm('確定要刪除這篇研究筆記嗎？')) {
      const updatedNotes = researchNotes.filter(n => n.id !== id);
      setResearchNotes(updatedNotes);
      saveToCloudImmediately(transactions, symbols, moodRecords, updatedNotes);
      appendLog(`已刪除研究筆記 ID: ${id}`);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen font-sans transition-colors ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      
      {/* 頂部導覽列 */}
      <header className={`sticky top-0 z-30 border-b px-4 py-3 flex items-center justify-between shadow-sm backdrop-blur-md ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">📈</span>
          <h1 className="text-base font-bold tracking-tight">投資與心態日記系統 <span className="text-xs font-mono text-emerald-400 ml-1">{version}</span></h1>
        </div>

        {/* 模組分流切換按鈕 */}
        <div className="flex items-center gap-1.5 bg-slate-950/40 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${activeTab === 'portfolio' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            💼 投資資產
          </button>
          <button
            onClick={() => setActiveTab('mood')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${activeTab === 'mood' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <BookOpen className="w-3.5 h-3.5" /> 心情日記
          </button>
          <button
            onClick={() => setActiveTab('research')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 ${activeTab === 'research' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <FileText className="w-3.5 h-3.5" /> 研究筆記
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* 主題切換按鈕 */}
          <button
            onClick={() => {
              const next = isDark ? 'light' : 'dark';
              setTheme(next);
              localStorage.setItem('portfolio_theme', next);
            }}
            className={`p-2 rounded-lg border transition ${isDark ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            title="切換深色/淺色主題"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* 除錯日誌按鈕 */}
          <button
            onClick={() => setShowLogModal(true)}
            className={`p-2 rounded-lg border transition relative ${isDark ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-white border-slate-300 text-slate-600 hover:text-black'}`}
            title="系統除錯日誌"
          >
            <Bug className="w-4 h-4 text-amber-500" />
            {debugLogs.length > 0 && <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[9px] font-bold px-1 rounded-full">{debugLogs.length}</span>}
          </button>

          {/* 雲端同步燈號 */}
          <div className="flex items-center pl-1">
            {syncStatus === 'syncing' && <div title="同步中..." className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400"><RefreshCw className="w-4 h-4 animate-spin" /></div>}
            {syncStatus === 'synced' && <div title="☁️ 雲端已即時同步" className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400"><Cloud className="w-4 h-4" /></div>}
            {syncStatus === 'error' && <div title="❌ 同步異常" className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400"><CloudOff className="w-4 h-4" /></div>}
          </div>
        </div>
      </header>

      {/* 主體內容區 (依據 activeTab 切換) */}
      <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        
        {/* 1. 投資資產頁籤 */}
        {activeTab === 'portfolio' && (
          <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-lg font-bold">💼 現貨股票與基金資產總覽</h2>
            <p className="text-sm opacity-75">美元即時匯率: <span className="font-mono text-cyan-400 font-bold">{usdRate}</span> TWD</p>
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-sm">
              目前追蹤部位總筆數：{transactions.length} 筆，系統已與 Supabase 雲端即時連線。
            </div>
          </div>
        )}

        {/* 2. 心情（日記）記事頁籤 */}
        {activeTab === 'mood' && (
          <div className={`p-6 rounded-2xl border shadow-sm space-y-5 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-500" /> 每日投資心態與交易日記
              </h2>
            </div>

            {/* 日期導覽 */}
            <div className="flex items-center justify-between gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              <button
                onClick={() => {
                  const d = new Date(activeMoodDate);
                  d.setDate(d.getDate() - 1);
                  setActiveMoodDate(d.toISOString().split('T')[0]);
                }}
                className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-emerald-500" />
                <input
                  type="date"
                  value={activeMoodDate}
                  onChange={(e) => setActiveMoodDate(e.target.value)}
                  className={`text-xs font-semibold px-2 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
                />
              </div>
              <button
                onClick={() => setActiveMoodDate(todayStr)}
                className={`px-3 py-1 text-xs rounded border ${activeMoodDate === todayStr ? 'bg-emerald-600 text-white border-emerald-600 font-bold' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                今天
              </button>
              <button
                onClick={() => {
                  const d = new Date(activeMoodDate);
                  d.setDate(d.getDate() + 1);
                  setActiveMoodDate(d.toISOString().split('T')[0]);
                }}
                className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 心態 Emoji 選擇 */}
            <div>
              <label className="text-xs font-semibold opacity-70 block mb-2">當日心情與心態評估</label>
              <div className="grid grid-cols-5 gap-2">
                {MOOD_OPTIONS.map((m) => {
                  const isSelected = currentMoodChoice.label === m.label;
                  return (
                    <button
                      key={m.label}
                      type="button"
                      onClick={() => setCurrentMoodChoice({ emoji: m.emoji, label: m.label })}
                      className={`flex flex-col items-center py-3 rounded-xl transition-all text-xs font-medium border ${
                        isSelected 
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md scale-105 font-bold' 
                          : isDark ? 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xl mb-1">{m.emoji}</span>
                      <span className="text-[10px]">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 心得文字 */}
            <div>
              <label className="text-xs font-semibold opacity-70 block mb-1.5">覆盤心得與進出場邏輯檢討</label>
              <textarea
                rows={4}
                placeholder="記錄盤勢轉折看法、買賣決策心態..."
                value={currentMoodNote}
                onChange={(e) => setCurrentMoodNote(e.target.value)}
                className={`w-full text-xs rounded-xl p-3 outline-none border resize-none leading-relaxed ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-emerald-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'}`}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveMood}
                className="text-xs px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/40 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> 儲存心情日記
              </button>
            </div>
          </div>
        )}

        {/* 3. 研究筆記頁籤（支援貼圖 & 記錄） */}
        {activeTab === 'research' && (
          <div className={`p-6 rounded-2xl border shadow-sm space-y-5 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" /> 投資研究筆記與圖表知識庫
              </h2>
              <button
                onClick={() => setEditingNote({ title: '', symbol: '', content: '', imageBase64: '' })}
                className="text-xs px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> 新增研究筆記
              </button>
            </div>

            {/* 新增/編輯 筆記表單 Modal 或區塊 */}
            {editingNote !== null && (
              <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/60 space-y-3">
                <div className="text-sm font-bold text-cyan-300">編輯研究筆記</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="筆記標題 (例: 2330 法說會重點)"
                    value={editingNote.title || ''}
                    onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                    className="text-xs px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    placeholder="標的代碼或分類 (例: 2330 / 半導體)"
                    value={editingNote.symbol || ''}
                    onChange={(e) => setEditingNote({ ...editingNote, symbol: e.target.value })}
                    className="text-xs px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 outline-none"
                  />
                </div>

                <textarea
                  rows={4}
                  placeholder="輸入技術分析、財報數據與研究心得..."
                  value={editingNote.content || ''}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                  className="w-full text-xs rounded-lg p-3 bg-slate-900 border border-slate-700 text-slate-100 outline-none resize-none"
                />

                {/* 貼圖上傳區 */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => noteImageRef.current?.click()}
                    className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-2 rounded-lg flex items-center gap-1.5 text-slate-200"
                  >
                    <Camera className="w-4 h-4 text-cyan-400" /> 上傳/貼入截圖
                  </button>
                  <input ref={noteImageRef} type="file" accept="image/*" className="hidden" onChange={handleNoteImageUpload} />
                  {editingNote.imageBase64 && <span className="text-xs text-emerald-400">✓ 已附加圖片</span>}
                </div>

                {editingNote.imageBase64 && (
                  <div className="relative w-full max-h-60 overflow-hidden rounded-lg border border-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editingNote.imageBase64} alt="筆記圖片" className="w-full h-auto object-contain" />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setEditingNote(null)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">取消</button>
                  <button onClick={handleSaveResearchNote} className="text-xs px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold">儲存筆記</button>
                </div>
              </div>
            )}

            {/* 研究筆記列表 */}
            <div className="space-y-4">
              {researchNotes.map((note) => (
                <div key={note.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-cyan-300">{note.title}</span>
                      {note.symbol && <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">#{note.symbol}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{note.createdAt}</span>
                      <button onClick={() => setEditingNote(note)} className="p-1 text-slate-400 hover:text-cyan-400"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteResearchNote(note.id)} className="p-1 text-slate-400 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {note.content && <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{note.content}</p>}
                  {note.imageBase64 && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-slate-800 max-h-72">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={note.imageBase64} alt="研究截圖" className="w-full h-auto object-cover" />
                    </div>
                  )}
                </div>
              ))}

              {researchNotes.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs">
                  尚無研究筆記，點擊上方按鈕開始建立您的投資知識庫！
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* 除錯日誌彈窗 (Modal) */}
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
                  <div key={i} className="leading-relaxed break-all text-slate-300">{log}</div>
                ))
              )}
            </div>
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between">
              <span>Investment Journal Debugger</span>
              <span>{version}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}