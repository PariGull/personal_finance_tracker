import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  PieChart as PieIcon,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Plus,
  Trash2,
  Download,
  Upload,
  Calendar,
  Layers,
  FileCode,
  GraduationCap,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Search,
  Filter,
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  Info,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  INITIAL_CATEGORIES,
  INITIAL_BUDGETS,
  generateSeedTransactions,
  Category,
  Transaction,
} from './data/initialData';
import {
  runModelTournament,
  detectZScoreOutliers,
  detectIQROutliers,
  ModelComparisonResult,
  OutlierItem,
} from './utils/forecastingMath';
import { PYTHON_PROJECT_FILES } from './data/projectFiles';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'transactions' | 'budgets' | 'forecasting' | 'outliers' | 'code' | 'interview'
  >('dashboard');

  // Application Data State
  const [categories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [budgets, setBudgets] = useState<Record<number, number>>(INITIAL_BUDGETS);
  const [transactions, setTransactions] = useState<Transaction[]>(generateSeedTransactions);

  // Month Selection State
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    availableMonths[0] || '2026-10'
  );

  // Transactions Filtering State
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add Transaction Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDate, setNewDate] = useState<string>('2026-10-09');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newCategoryId, setNewCategoryId] = useState<number>(4); // Groceries
  const [newNote, setNewNote] = useState<string>('');

  // Forecasting Configuration State
  const [forecastHorizon, setForecastHorizon] = useState<number>(3);
  const [forecastTargetCat, setForecastTargetCat] = useState<string>('all');
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [showMathExpander, setShowMathExpander] = useState<boolean>(true);

  // Outlier Configuration State
  const [outlierMethod, setOutlierMethod] = useState<'zscore' | 'iqr'>('zscore');
  const [zThreshold, setZThreshold] = useState<number>(2.0);
  const [iqrMultiplier, setIqrMultiplier] = useState<number>(1.5);

  // Code Explorer State
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Quick category maps
  const categoryMap = useMemo(() => {
    const map = new Map<number, Category>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // Reset database to initial 18-month seed
  const handleResetData = () => {
    setTransactions(generateSeedTransactions());
    setBudgets(INITIAL_BUDGETS);
    setSelectedMonth('2026-10');
  };

  // Add transaction handler
  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newAmount);
    if (isNaN(amt) || amt <= 0) return;

    const newTx: Transaction = {
      id: Date.now(),
      date: newDate,
      amount: amt,
      categoryId: newCategoryId,
      note: newNote.trim(),
    };

    setTransactions((prev) => [newTx, ...prev]);
    setShowAddModal(false);
    setNewAmount('');
    setNewNote('');
  };

  // Delete transaction
  const handleDeleteTransaction = (id: number) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  // CSV Export handler
  const handleExportCSV = () => {
    const header = 'date,amount,category,type,note\n';
    const rows = transactions.map((t) => {
      const cat = categoryMap.get(t.categoryId);
      const noteClean = t.note ? `"${t.note.replace(/"/g, '""')}"` : '""';
      return `${t.date},${t.amount},"${cat?.name || 'Uncategorized'}",${cat?.type || 'expense'},${noteClean}`;
    });
    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV Import handler
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      if (lines.length < 2) return;

      const newItems: Transaction[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 3) {
          const dt = parts[0].replace(/"/g, '').trim();
          const amt = parseFloat(parts[1].replace(/"/g, ''));
          const catName = parts[2].replace(/"/g, '').trim();
          const noteStr = parts.slice(4).join(',').replace(/"/g, '').trim();

          const foundCat = categories.find(
            (c) => c.name.toLowerCase() === catName.toLowerCase()
          );
          if (!isNaN(amt) && amt > 0 && dt) {
            newItems.push({
              id: Date.now() + i,
              date: dt,
              amount: amt,
              categoryId: foundCat ? foundCat.id : 10,
              note: noteStr,
            });
          }
        }
      }
      if (newItems.length > 0) {
        setTransactions((prev) => [...newItems, ...prev]);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Download Python Project as ZIP
  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      PYTHON_PROJECT_FILES.forEach((f) => {
        zip.file(f.path, f.content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'personal-finance-forecasting-python.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setIsZipping(false);
    }
  };

  // Monthly aggregated data for selected month
  const currentMonthTransactions = useMemo(() => {
    return transactions.filter((t) => t.date.startsWith(selectedMonth));
  }, [transactions, selectedMonth]);

  const { totalIncome, totalExpenses, netSavings, savingsRate, categorySpendMap } = useMemo(() => {
    let income = 0;
    let expense = 0;
    const catMap: Record<number, number> = {};

    currentMonthTransactions.forEach((t) => {
      const cat = categoryMap.get(t.categoryId);
      if (cat?.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
        catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
      }
    });

    const net = income - expense;
    const rate = income > 0 ? (net / income) * 100 : 0;
    return {
      totalIncome: income,
      totalExpenses: expense,
      netSavings: net,
      savingsRate: rate,
      categorySpendMap: catMap,
    };
  }, [currentMonthTransactions, categoryMap]);

  // Multi-month trend calculations
  const monthlyTrends = useMemo(() => {
    const monthsSorted = [...availableMonths].sort();
    return monthsSorted.map((ym) => {
      let inc = 0;
      let exp = 0;
      transactions.forEach((t) => {
        if (t.date.startsWith(ym)) {
          const cat = categoryMap.get(t.categoryId);
          if (cat?.type === 'income') inc += t.amount;
          else exp += t.amount;
        }
      });
      return { month: ym, income: inc, expenses: exp, net: inc - exp };
    });
  }, [availableMonths, transactions, categoryMap]);

  // Time Series Aggregation for Forecasting
  const forecastingSeries = useMemo(() => {
    const monthsSorted = [...availableMonths].sort();
    const historyMonths: string[] = [];
    const historyValues: number[] = [];

    monthsSorted.forEach((ym) => {
      let sum = 0;
      transactions.forEach((t) => {
        if (t.date.startsWith(ym)) {
          const cat = categoryMap.get(t.categoryId);
          if (cat?.type === 'expense') {
            if (forecastTargetCat === 'all' || cat?.name === forecastTargetCat) {
              sum += t.amount;
            }
          }
        }
      });
      historyMonths.push(ym);
      historyValues.push(sum);
    });

    return { historyMonths, historyValues };
  }, [availableMonths, transactions, categoryMap, forecastTargetCat]);

  // Run Tournament on the time series
  const tournamentResult: ModelComparisonResult = useMemo(() => {
    return runModelTournament(
      forecastingSeries.historyMonths,
      forecastingSeries.historyValues,
      forecastHorizon,
      3
    );
  }, [forecastingSeries, forecastHorizon]);

  // Active Model selected
  const activeModelName = selectedModelName || tournamentResult.championName;
  const activeModelData = tournamentResult.models[activeModelName] || tournamentResult.models[tournamentResult.championName];

  // Outlier items computation
  const transactionsForOutliers = useMemo(() => {
    return transactions.map((t) => {
      const c = categoryMap.get(t.categoryId);
      return {
        id: t.id,
        date: t.date,
        amount: t.amount,
        category: c?.name || 'Miscellaneous',
        note: t.note,
        type: c?.type || 'expense',
      };
    });
  }, [transactions, categoryMap]);

  const flaggedOutliers: OutlierItem[] = useMemo(() => {
    if (outlierMethod === 'zscore') {
      return detectZScoreOutliers(transactionsForOutliers, zThreshold);
    } else {
      return detectIQROutliers(transactionsForOutliers, iqrMultiplier);
    }
  }, [transactionsForOutliers, outlierMethod, zThreshold, iqrMultiplier]);

  // Filtered transactions list for ledger
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const cat = categoryMap.get(t.categoryId);
      if (txTypeFilter !== 'all' && cat?.type !== txTypeFilter) return false;
      if (txCategoryFilter !== 'all' && cat?.name !== txCategoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inNote = t.note.toLowerCase().includes(q);
        const inCat = cat?.name.toLowerCase().includes(q);
        if (!inNote && !inCat) return false;
      }
      return true;
    });
  }, [transactions, categoryMap, txTypeFilter, txCategoryFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                Personal Finance Tracker
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                BS Math Portfolio
              </span>
            </div>
            <p className="text-xs text-slate-400">
              SQLite • Streamlit • Time-Series Forecasting (ARIMA & Holt-Winters) • Anomaly Detection
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleResetData}
            title="Reset to 18-month seed data"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset 18-Mo Data</span>
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isZipping ? 'Generating Zip...' : 'Download Python Repo (.zip)'}</span>
          </button>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="border-b border-slate-800 bg-slate-900/50 px-4 lg:px-8 overflow-x-auto">
        <div className="flex space-x-1 min-w-max py-2">
          {[
            { id: 'dashboard', label: '📊 Dashboard', desc: 'KPIs & Trends' },
            { id: 'transactions', label: '💳 Transactions', desc: 'Ledger & CSV' },
            { id: 'budgets', label: '🎯 Budgets & Alerts', desc: 'Category Limits' },
            { id: 'forecasting', label: '🔮 Forecasting Engine', desc: 'ARIMA, OLS & HW' },
            { id: 'outliers', label: '🔍 Outlier Insights', desc: 'Z-score & IQR' },
            { id: 'code', label: '💻 Python Codebase', desc: 'Modular Source Files' },
            { id: 'interview', label: '📐 Math & Interview Defense', desc: 'Theory & Q&A' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-start px-3.5 py-2 rounded-lg text-xs transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span className="text-sm">{tab.label}</span>
              <span className="text-[10px] opacity-75">{tab.desc}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
        {/* ============================================================ */}
        {/* 1. DASHBOARD VIEW                                             */}
        {/* ============================================================ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-white">Monthly Overview</h2>
                <p className="text-xs text-slate-400">
                  Select a historical month to inspect cash flows and category distributions.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <label className="text-xs text-slate-300 font-medium">Month:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Total Income</span>
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-2">
                  ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Salary & Freelance Cash Inflows</div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Total Expenses</span>
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-bold text-rose-400 mt-2">
                  ${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Total outflows across all categories</div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Net Savings</span>
                  <DollarSign className="w-4 h-4 text-indigo-400" />
                </div>
                <div className={`text-2xl font-bold mt-2 ${netSavings >= 0 ? 'text-indigo-300' : 'text-amber-400'}`}>
                  ${netSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {netSavings >= 0 ? 'Positive net accumulation' : 'Deficit burn this month'}
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Savings Rate</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      savingsRate >= 20 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    Target 20%
                  </span>
                </div>
                <div className="text-2xl font-bold text-white mt-2">{savingsRate.toFixed(1)}%</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {savingsRate >= 20 ? '✅ Above optimal 20% benchmark' : '⚠️ Below optimal 20% benchmark'}
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Category Spending Breakdown */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-indigo-400" />
                    Spending by Category ({selectedMonth})
                  </h3>
                  <span className="text-xs text-slate-400">Total: ${totalExpenses.toFixed(2)}</span>
                </div>

                {totalExpenses === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-500 text-xs">
                    No expense transactions found for {selectedMonth}
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 flex flex-col justify-center">
                    {categories
                      .filter((c) => c.type === 'expense' && (categorySpendMap[c.id] || 0) > 0)
                      .sort((a, b) => (categorySpendMap[b.id] || 0) - (categorySpendMap[a.id] || 0))
                      .map((cat) => {
                        const amt = categorySpendMap[cat.id] || 0;
                        const pct = (amt / totalExpenses) * 100;
                        return (
                          <div key={cat.id} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="flex items-center gap-2 font-medium text-slate-300">
                                <span
                                  className="w-2.5 h-2.5 rounded-full inline-block"
                                  style={{ backgroundColor: cat.color }}
                                />
                                {cat.name}
                              </span>
                              <span className="font-semibold text-slate-200">
                                ${amt.toFixed(2)}{' '}
                                <span className="text-slate-500 text-[10px]">({pct.toFixed(1)}%)</span>
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: cat.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Monthly Trend Historical Chart */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Historical Income vs. Expense Trends
                  </h3>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Income
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-400" /> Expenses
                    </span>
                  </div>
                </div>

                {/* SVG Visualizer */}
                <div className="h-64 relative flex items-end pt-6 pb-6">
                  {(() => {
                    const maxVal = Math.max(
                      ...monthlyTrends.map((m) => Math.max(m.income, m.expenses)),
                      1000
                    );
                    return (
                      <div className="w-full h-full flex items-end justify-between gap-1">
                        {monthlyTrends.slice(-12).map((item) => {
                          const incHeight = (item.income / maxVal) * 100;
                          const expHeight = (item.expenses / maxVal) * 100;
                          const isCurrent = item.month === selectedMonth;
                          return (
                            <div
                              key={item.month}
                              className={`flex-1 flex flex-col items-center gap-1 h-full justify-end group relative cursor-pointer ${
                                isCurrent ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                              }`}
                              onClick={() => setSelectedMonth(item.month)}
                            >
                              {/* Tooltip */}
                              <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-slate-800 border border-slate-700 text-[10px] text-white px-2 py-1 rounded shadow-lg z-20 whitespace-nowrap">
                                <div>{item.month}</div>
                                <div className="text-emerald-400">Inc: ${item.income.toFixed(0)}</div>
                                <div className="text-rose-400">Exp: ${item.expenses.toFixed(0)}</div>
                              </div>

                              <div className="w-full flex items-end justify-center gap-0.5 h-full">
                                <div
                                  className="w-1.5 sm:w-2 bg-emerald-500 rounded-t transition-all"
                                  style={{ height: `${incHeight}%` }}
                                />
                                <div
                                  className="w-1.5 sm:w-2 bg-rose-500 rounded-t transition-all"
                                  style={{ height: `${expHeight}%` }}
                                />
                              </div>
                              <span
                                className={`text-[9px] mt-1 ${
                                  isCurrent ? 'font-bold text-indigo-400' : 'text-slate-400'
                                }`}
                              >
                                {item.month.slice(5)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-[11px] text-slate-400 text-center mt-2">
                  Showing past 12 months • Click any month bar to inspect its details
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 2. TRANSACTIONS VIEW                                          */}
        {/* ============================================================ */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search notes or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Type Filter */}
                <select
                  value={txTypeFilter}
                  onChange={(e) => setTxTypeFilter(e.target.value as any)}
                  className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="expense">Expenses Only</option>
                  <option value="income">Income Only</option>
                </select>

                {/* Category Filter */}
                <select
                  value={txCategoryFilter}
                  onChange={(e) => setTxCategoryFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Transaction</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>

                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImportCSV}
                  />
                </label>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Displaying {filteredTransactions.length} transaction records</span>
                <span className="text-[11px] text-slate-500">Sorted chronologically (most recent first)</span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-300 sticky top-0 uppercase tracking-wider font-semibold border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Memo / Description</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredTransactions.slice(0, 100).map((tx) => {
                      const cat = categoryMap.get(tx.categoryId);
                      const isIncome = cat?.type === 'income';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                          <td className="px-4 py-2.5 font-mono text-slate-300 whitespace-nowrap">
                            {tx.date}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-200">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: cat?.color || '#3B82F6' }}
                              />
                              {cat?.name || 'Uncategorized'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                isIncome
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {cat?.type || 'expense'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-300 max-w-xs truncate">
                            {tx.note || '—'}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold font-mono whitespace-nowrap ${
                              isIncome ? 'text-emerald-400' : 'text-slate-100'
                            }`}
                          >
                            {isIncome ? '+' : '-'}${tx.amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-slate-800 transition"
                              title="Delete transaction"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal for Adding Transaction */}
            {showAddModal && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Plus className="w-4 h-4 text-indigo-400" />
                      Record New Transaction
                    </h3>
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="text-slate-400 hover:text-slate-200 text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleAddTransaction} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Date</label>
                      <input
                        type="date"
                        required
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="e.g. 85.50"
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Category</label>
                      <select
                        value={newCategoryId}
                        onChange={(e) => setNewCategoryId(parseInt(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Note / Description
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Weekly supermarket run"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition shadow"
                      >
                        Save Transaction
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* 3. BUDGETS & ALERTS VIEW                                      */}
        {/* ============================================================ */}
        {activeTab === 'budgets' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-white">Category Budgets & Threshold Warnings</h2>
                <p className="text-xs text-slate-400">
                  Track actual monthly spending against predefined limits with warning thresholds.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Target Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Threshold Status Badges Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-900/40 p-3 rounded-lg border border-slate-800">
              <span className="font-semibold text-slate-300">Warning Statuses:</span>
              <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <CheckCircle className="w-3 h-3" /> On Track (&lt;80%)
              </span>
              <span className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                <AlertTriangle className="w-3 h-3" /> Warning (80% - 100%)
              </span>
              <span className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                <AlertTriangle className="w-3 h-3" /> Over Budget (&gt;100%)
              </span>
            </div>

            {/* Category Budgets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories
                .filter((c) => c.type === 'expense')
                .map((cat) => {
                  const spent = categorySpendMap[cat.id] || 0;
                  const limit = budgets[cat.id] || 300;
                  const pct = limit > 0 ? (spent / limit) * 100 : 0;
                  const remaining = limit - spent;

                  let statusBadge = (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> On Track ({pct.toFixed(0)}%)
                    </span>
                  );
                  let barColor = 'bg-emerald-500';

                  if (pct > 100) {
                    statusBadge = (
                      <span className="text-rose-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Over by ${Math.abs(remaining).toFixed(2)} ({pct.toFixed(0)}%)
                      </span>
                    );
                    barColor = 'bg-rose-500';
                  } else if (pct >= 80) {
                    statusBadge = (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Warning: {pct.toFixed(0)}% used
                      </span>
                    );
                    barColor = 'bg-amber-500';
                  }

                  return (
                    <div
                      key={cat.id}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <h4 className="text-sm font-semibold text-white">{cat.name}</h4>
                        </div>
                        <div className="text-xs">{statusBadge}</div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>
                            Spent: <strong className="text-slate-200">${spent.toFixed(2)}</strong>
                          </span>
                          <span>
                            Limit: <strong className="text-slate-200">${limit.toFixed(2)}</strong>
                          </span>
                          <span>
                            Remaining:{' '}
                            <strong className={remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              ${remaining.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Modify budget input */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] text-slate-400">Adjust Budget Limit:</span>
                        <input
                          type="number"
                          step="25"
                          min="0"
                          value={limit}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setBudgets((prev) => ({ ...prev, [cat.id]: val }));
                          }}
                          className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-[11px] text-slate-400">/ month</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 4. TIME-SERIES FORECASTING VIEW                               */}
        {/* ============================================================ */}
        {activeTab === 'forecasting' && (
          <div className="space-y-6">
            {/* Controls Bar */}
            <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Multi-Model Predictive Expense Forecasting
                  </h2>
                  <p className="text-xs text-slate-400">
                    Compares 4 time-series models on holdout test sets, computing MAE and RMSE to identify the champion predictor.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Category Target */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-300 font-medium">Target:</label>
                    <select
                      value={forecastTargetCat}
                      onChange={(e) => setForecastTargetCat(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="all">All Expense Categories Combined</option>
                      {categories
                        .filter((c) => c.type === 'expense')
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Horizon Slider */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-300 font-medium">Horizon:</label>
                    <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700 text-xs">
                      {[1, 2, 3].map((h) => (
                        <button
                          key={h}
                          onClick={() => setForecastHorizon(h)}
                          className={`px-2 py-0.5 rounded transition ${
                            forecastHorizon === h
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {h}M
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tournament Ranking Table */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    🏆 Model Evaluation Tournament (Holdout Validation)
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Lower MAE & RMSE indicate superior out-of-sample forecast accuracy
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {tournamentResult.table.map((row) => {
                    const isChampion = row.model === tournamentResult.championName;
                    const isInspecting = row.model === activeModelName;
                    return (
                      <div
                        key={row.model}
                        onClick={() => setSelectedModelName(row.model)}
                        className={`p-3 rounded-xl border cursor-pointer transition relative ${
                          isInspecting
                            ? 'bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-500/10'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isChampion && (
                          <span className="absolute -top-2.5 right-3 bg-emerald-500 text-slate-950 font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                            Best Model
                          </span>
                        )}
                        <div className="text-xs font-semibold text-white truncate">{row.model}</div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                          <span>
                            MAE: <strong className="text-slate-200">${row.mae.toFixed(2)}</strong>
                          </span>
                          <span>
                            RMSE: <strong className="text-slate-200">${row.rmse.toFixed(2)}</strong>
                          </span>
                        </div>
                        <div className="text-[10px] text-indigo-400 mt-1 font-medium">
                          {isInspecting ? '● Currently Plotting' : 'Click to inspect chart'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Forecast Chart Visualization */}
            <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Forecast Projection:</span>
                    <span className="text-indigo-400">{activeModelName}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Solid line indicates historical actuals • Dashed line shows future projected path with 95% confidence intervals.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Historical
                  </span>
                  <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Forecast
                  </span>
                  <span className="flex items-center gap-1.5 text-indigo-400/80">
                    <span className="w-3 h-2 rounded bg-indigo-500/20 border border-indigo-500/40" /> 95% Confidence Band
                  </span>
                </div>
              </div>

              {/* Interactive SVG Projection Chart */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 h-72 flex flex-col justify-end">
                {(() => {
                  const histLen = forecastingSeries.historyValues.length;
                  const recentHist = forecastingSeries.historyValues.slice(-10);
                  const recentMonths = forecastingSeries.historyMonths.slice(-10);

                  const allPoints = [
                    ...recentHist,
                    ...activeModelData.predictions,
                    ...activeModelData.upperBounds,
                  ];
                  const maxVal = Math.max(...allPoints, 500) * 1.15;
                  const minVal = Math.max(0, Math.min(...recentHist, ...activeModelData.lowerBounds) * 0.85);
                  const range = maxVal - minVal || 1;

                  const totalSteps = recentHist.length + activeModelData.predictions.length;

                  return (
                    <div className="w-full h-full relative flex items-end">
                      {/* Grid Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                        <div className="border-b border-slate-700 w-full text-[10px] text-slate-400">
                          ${maxVal.toFixed(0)}
                        </div>
                        <div className="border-b border-slate-700 w-full text-[10px] text-slate-400">
                          ${((maxVal + minVal) / 2).toFixed(0)}
                        </div>
                        <div className="border-b border-slate-700 w-full text-[10px] text-slate-400">
                          ${minVal.toFixed(0)}
                        </div>
                      </div>

                      {/* SVG Line & Ribbon */}
                      <svg className="w-full h-full overflow-visible">
                        {/* Shaded Confidence Ribbon */}
                        {(() => {
                          const ribbonPoints: Array<{ x: number; yLow: number; yHigh: number }> = [];
                          const startIndex = recentHist.length - 1;
                          const startX = (startIndex / (totalSteps - 1)) * 100;
                          const startY = (1 - (recentHist[recentHist.length - 1] - minVal) / range) * 100;

                          // Upper path
                          let upperD = `M ${startX}% ${startY}% `;
                          activeModelData.futureMonths.forEach((_, fIdx) => {
                            const curIdx = startIndex + 1 + fIdx;
                            const x = (curIdx / (totalSteps - 1)) * 100;
                            const yUpper = (1 - (activeModelData.upperBounds[fIdx] - minVal) / range) * 100;
                            upperD += `L ${x}% ${yUpper}% `;
                          });

                          // Lower path backward
                          for (let fIdx = activeModelData.futureMonths.length - 1; fIdx >= 0; fIdx--) {
                            const curIdx = startIndex + 1 + fIdx;
                            const x = (curIdx / (totalSteps - 1)) * 100;
                            const yLower = (1 - (activeModelData.lowerBounds[fIdx] - minVal) / range) * 100;
                            upperD += `L ${x}% ${yLower}% `;
                          }
                          upperD += `Z`;

                          return (
                            <path
                              d={upperD}
                              className="fill-indigo-500/15 stroke-indigo-500/30 stroke-dasharray-2"
                            />
                          );
                        })()}

                        {/* Historical Actuals Line */}
                        {(() => {
                          const pts = recentHist.map((v, i) => {
                            const x = (i / (totalSteps - 1)) * 100;
                            const y = (1 - (v - minVal) / range) * 100;
                            return `${x}% ${y}%`;
                          });
                          return (
                            <polyline
                              fill="none"
                              stroke="#94A3B8"
                              strokeWidth="2.5"
                              points={pts.join(', ')}
                            />
                          );
                        })()}

                        {/* Forecast Projection Line */}
                        {(() => {
                          const startX = ((recentHist.length - 1) / (totalSteps - 1)) * 100;
                          const startY =
                            (1 - (recentHist[recentHist.length - 1] - minVal) / range) * 100;
                          let pts = `${startX}% ${startY}%`;
                          activeModelData.predictions.forEach((p, idx) => {
                            const curIdx = recentHist.length + idx;
                            const x = (curIdx / (totalSteps - 1)) * 100;
                            const y = (1 - (p - minVal) / range) * 100;
                            pts += `, ${x}% ${y}%`;
                          });

                          return (
                            <polyline
                              fill="none"
                              stroke="#6366F1"
                              strokeWidth="3"
                              strokeDasharray="4 3"
                              points={pts}
                            />
                          );
                        })()}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* Numerical Projections Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {activeModelData.futureMonths.map((m, idx) => {
                  const pred = activeModelData.predictions[idx];
                  const low = activeModelData.lowerBounds[idx];
                  const high = activeModelData.upperBounds[idx];
                  return (
                    <div
                      key={m}
                      className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1"
                    >
                      <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                        <span>Projected Month</span>
                        <span className="text-indigo-400 font-mono">{m}</span>
                      </div>
                      <div className="text-xl font-bold text-white font-mono">
                        ${pred.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span>95% CI Range:</span>
                        <span className="text-slate-300 font-mono">
                          ${low.toFixed(0)} - ${high.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* "How It Works" Mathematical Expander */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowMathExpander(!showMathExpander)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Mathematical Foundations & Algorithm Mechanics ({activeModelName})
                    </h4>
                    <p className="text-xs text-slate-400">
                      Formulations, parameter optimization, and interview explanations.
                    </p>
                  </div>
                </div>
                {showMathExpander ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showMathExpander && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800 space-y-4 text-xs text-slate-300">
                  {activeModelName.includes('Moving Average') && (
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-indigo-300 text-center text-sm">
                        ŷ_{'{T+h}'} = (1 / k) ∑_{'{i=0}'}^k y_{'{T-i}'}
                      </div>
                      <p>
                        <strong>Concept:</strong> Simple Moving Average (SMA) projects future values by taking the arithmetic mean of the last <em>k</em> observations. It acts as a low-pass filter, attenuating short-term white noise volatility.
                      </p>
                      <p>
                        <strong>Prediction Interval (95%):</strong> Computed from historical residual variance: ŷ ± 1.96 · s_e · √(1 + 1/k).
                      </p>
                      <p className="text-slate-400">
                        • <em>Strengths:</em> Zero hyperparameters to overfit; impervious to sudden one-time outlier distortion.<br />
                        • <em>Limitations:</em> Systematic lag behind sustained upward or downward spending trends.
                      </p>
                    </div>
                  )}

                  {activeModelName.includes('Linear Regression') && (
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-indigo-300 text-center text-sm">
                        y_t = β_0 + β_1·t + ε_t, &nbsp; β̂_1 = ∑(t - t̄)(y_t - ȳ) / ∑(t - t̄)²
                      </div>
                      <p>
                        <strong>Concept:</strong> Ordinary Least Squares (OLS) calculates the best linear unbiased estimator (BLUE) minimizing the sum of squared residuals: SSR = ∑(y_t - ŷ_t)².
                      </p>
                      <p>
                        <strong>Standard Error of Forecast:</strong> s_e · √(1 + 1/n + (t_h - t̄)² / ∑(t_i - t̄)²). As the forecasting horizon advances further into the future (t_h &gt;&gt; t̄), the uncertainty envelope parabolically expands.
                      </p>
                      <p className="text-slate-400">
                        • <em>Strengths:</em> Directly models inflation and lifestyle growth rates over time.<br />
                        • <em>Limitations:</em> Extrapolates trends unconditionally without bounds.
                      </p>
                    </div>
                  )}

                  {activeModelName.includes('Holt-Winters') && (
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-indigo-300 text-center text-sm">
                        ℓ_t = α(y_t - s_{'{t-m}'}) + (1-α)(ℓ_{'{t-1}'} + b_{'{t-1}'})<br />
                        b_t = β(ℓ_t - ℓ_{'{t-1}'}) + (1-β)b_{'{t-1}'}
                      </div>
                      <p>
                        <strong>Concept:</strong> Triple Exponential Smoothing separates the time-series into three recursively updated state vectors: Level (ℓ), Velocity Trend (b), and Seasonal index (s).
                      </p>
                      <p>
                        <strong>Weighting Parameters:</strong> α, β, γ ∈ [0, 1] dictate the exponential forgetting rate. Recent points contribute exponentially higher weights than distant past observations.
                      </p>
                      <p className="text-slate-400">
                        • <em>Strengths:</em> Adapts smoothly to changing trend slopes and recurring annual or cyclical monthly peaks (e.g. holiday spending in December).<br />
                        • <em>Limitations:</em> Requires sufficient history (ideally ≥24 months) to fully estimate monthly seasonal coefficients.
                      </p>
                    </div>
                  )}

                  {activeModelName.includes('ARIMA') && (
                    <div className="space-y-2">
                      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-indigo-300 text-center text-sm">
                        (1 - φ_1 B)(1 - B)^d y_t = c + (1 + θ_1 B)ε_t
                      </div>
                      <p>
                        <strong>Concept:</strong> AutoRegressive Integrated Moving Average combines lag regression (AR) with moving error shocks (MA) on a differenced stationary process (I).
                      </p>
                      <p>
                        <strong>Stationarity:</strong> The first-order differencing operator (1 - B) eliminates non-stationary stochastic trends, enabling maximum likelihood estimation of autocorrelation parameters.
                      </p>
                      <p className="text-slate-400">
                        • <em>Strengths:</em> Rigorous theoretical framework with robust asymptotic properties.<br />
                        • <em>Limitations:</em> In small personal finance datasets (&lt;15 points), parameter estimates can exhibit high sample variance.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 5. OUTLIERS & INSIGHTS VIEW                                   */}
        {/* ============================================================ */}
        {activeTab === 'outliers' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Statistical Outlier & Spending Anomaly Detection
                  </h2>
                  <p className="text-xs text-slate-400">
                    Pinpoints abnormal expenditures within each category using Parametric Z-Score or Non-Parametric Tukey's IQR tests.
                  </p>
                </div>

                {/* Method Toggle */}
                <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
                  <button
                    onClick={() => setOutlierMethod('zscore')}
                    className={`px-3 py-1 rounded transition font-medium ${
                      outlierMethod === 'zscore'
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Z-Score (Normal)
                  </button>
                  <button
                    onClick={() => setOutlierMethod('iqr')}
                    className={`px-3 py-1 rounded transition font-medium ${
                      outlierMethod === 'iqr'
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tukey's IQR (Robust)
                  </button>
                </div>
              </div>

              {/* Sensitivity Sliders */}
              <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                {outlierMethod === 'zscore' ? (
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                      Z-Score Sensitivity Threshold:
                    </span>
                    <input
                      type="range"
                      min="1.5"
                      max="3.5"
                      step="0.1"
                      value={zThreshold}
                      onChange={(e) => setZThreshold(parseFloat(e.target.value))}
                      className="w-48 accent-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      +{zThreshold.toFixed(1)}σ from mean
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 flex-1">
                    <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                      Tukey IQR Multiplier:
                    </span>
                    <input
                      type="range"
                      min="1.0"
                      max="3.0"
                      step="0.1"
                      value={iqrMultiplier}
                      onChange={(e) => setIqrMultiplier(parseFloat(e.target.value))}
                      className="w-48 accent-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      Upper Fence = Q3 + {iqrMultiplier.toFixed(1)} × IQR
                    </span>
                  </div>
                )}

                <div className="text-xs text-slate-400">
                  Detected <strong className="text-amber-400">{flaggedOutliers.length}</strong> anomaly points
                </div>
              </div>
            </div>

            {/* Plain-English Executive Summary Box */}
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-5 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Plain-English Diagnostic Summary
              </h3>
              <p className="text-xs text-slate-200 leading-relaxed">
                {flaggedOutliers.length === 0 ? (
                  '✅ All recorded transactions align within standard historical confidence bounds. No abnormal single-item expenditures detected.'
                ) : (
                  <>
                    ⚠️ Analysis flagged <strong>{flaggedOutliers.length} abnormal transactions</strong> totaling{' '}
                    <strong>
                      ${flaggedOutliers.reduce((a, b) => a + b.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                    . The largest single divergence was a <strong>${flaggedOutliers[0].amount.toFixed(2)}</strong> expense in{' '}
                    <em>{flaggedOutliers[0].category}</em> on {flaggedOutliers[0].date} ({flaggedOutliers[0].note || 'No memo'}), which triggered the rule: {flaggedOutliers[0].reason}.
                  </>
                )}
              </p>
            </div>

            {/* Flagged Anomaly Transactions Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Flagged Outlier Transactions</span>
                <span className="text-[11px] text-slate-500">Filtered by mathematical threshold</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-300 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Amount</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5">Deviation Metric</th>
                      <th className="px-4 py-2.5">Mathematical Trigger</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {flaggedOutliers.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono text-slate-300">{item.date}</td>
                        <td className="px-4 py-2.5 font-medium text-white">{item.category}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-amber-400">
                          ${item.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300">{item.note}</td>
                        <td className="px-4 py-2.5 font-mono text-indigo-300">
                          {outlierMethod === 'zscore' ? `+${item.metric}σ` : `+$${item.metric}`}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-[11px]">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 6. CODEBASE EXPLORER VIEW                                     */}
        {/* ============================================================ */}
        {activeTab === 'code' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-400" />
                  Python Project Source Code Explorer
                </h2>
                <p className="text-xs text-slate-400">
                  Browse and copy all production modules (`app.py`, `db.py`, `forecasting.py`, `utils.py`, `tests/`) designed for your portfolio.
                </p>
              </div>

              <button
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition"
              >
                <Download className="w-4 h-4" />
                <span>{isZipping ? 'Bundling Zip...' : 'Download Full Repository (.zip)'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* File Tree Navigator */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2">
                  Project Files
                </div>
                {PYTHON_PROJECT_FILES.map((file, idx) => (
                  <button
                    key={file.path}
                    onClick={() => {
                      setSelectedFileIdx(idx);
                      setCopiedCode(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                      selectedFileIdx === idx
                        ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="font-mono">{file.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase">{file.language}</span>
                  </button>
                ))}
              </div>

              {/* Code Viewer Panel */}
              <div className="lg:col-span-3 bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-white">
                      {PYTHON_PROJECT_FILES[selectedFileIdx].path}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {PYTHON_PROJECT_FILES[selectedFileIdx].description}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(PYTHON_PROJECT_FILES[selectedFileIdx].content);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 bg-slate-950 font-mono text-xs text-slate-300 overflow-x-auto max-h-[550px] leading-relaxed selection:bg-indigo-600">
                  <code>{PYTHON_PROJECT_FILES[selectedFileIdx].content}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 7. MATH & INTERVIEW DEFENSE GUIDE                             */}
        {/* ============================================================ */}
        {activeTab === 'interview' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                BS Mathematics Interview Guide & Theoretical Defense
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Essential talking points, loss functions, statistical proofs, and design trade-offs to articulate in technical interviews.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Question 1: MAE vs RMSE */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                  <Zap className="w-4 h-4" />
                  Q1: Why compare models using both MAE and RMSE?
                </div>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    <strong>Mathematical Basis:</strong> MAE is an <em>L₁ norm</em> loss:
                    <span className="block my-1 font-mono text-indigo-300 text-center">
                      MAE = (1/n) ∑ |y_i - ŷ_i|
                    </span>
                    RMSE is an <em>L₂ norm</em> loss:
                    <span className="block my-1 font-mono text-indigo-300 text-center">
                      RMSE = √((1/n) ∑ (y_i - ŷ_i)²)
                    </span>
                  </p>
                  <p>
                    <strong>Interview Talking Point:</strong> RMSE heavily penalizes large solitary prediction errors due to the squaring operation. In personal finance, a $500 unexpected deficit is substantially more disruptive to budgeting than five $100 discrepancies. Thus, RMSE is prioritized as the primary tournament ranking metric.
                  </p>
                </div>
              </div>

              {/* Question 2: Why raw SQLite over ORM */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  Q2: Why use raw parameterized SQL queries instead of an ORM?
                </div>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    <strong>Design Rationale:</strong> Standard Python <code>sqlite3</code> provides complete transparency over relational indexes (<code>idx_transactions_date</code>, <code>FOREIGN KEY</code> constraints) and allows crafting optimized aggregation queries directly:
                  </p>
                  <div className="p-2 bg-slate-950 font-mono text-[11px] text-slate-400 rounded">
                    SELECT strftime('%Y-%m', date) AS ym, SUM(amount)<br />
                    FROM transactions WHERE type = 'expense' GROUP BY ym;
                  </div>
                  <p>
                    <strong>Interview Talking Point:</strong> As a mathematics student, writing SQL queries directly demonstrates fundamental data manipulation literacy and enables inspecting SQLite execution plans with zero ORM abstraction overhead.
                  </p>
                </div>
              </div>

              {/* Question 3: Outlier Tests */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Q3: Parametric Z-Score vs. Non-Parametric Tukey's IQR?
                </div>
                <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                  <p>
                    <strong>Z-Score:</strong> Assumes normality: <code>z = (x - μ) / σ</code>. The breakdown point is 0%, meaning a single extreme outlier can artificially inflate both the sample mean and variance.
                  </p>
                  <p>
                    <strong>Tukey's IQR:</strong> Uses medians and quartiles: <code>Upper = Q3 + 1.5 × IQR</code>. It has a 25% breakdown point, making it immune to masking effects in highly skewed expenditure distributions.
                  </p>
                </div>
              </div>

              {/* Question 4: 5 Strategic Extensions */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                  <Sparkles className="w-4 h-4" />
                  Q4: Top 5 Next Features to Expand this System
                </div>
                <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <div>1. <strong>Multi-User Authentication:</strong> SQLite / PostgreSQL user tables with bcrypt salted password hashing.</div>
                  <div>2. <strong>Recurring Transaction Engine:</strong> Cron schedule to auto-post periodic rent and subscription entries.</div>
                  <div>3. <strong>Plaid Bank Sync:</strong> Real-time OAuth transaction streaming from credit card and bank APIs.</div>
                  <div>4. <strong>Streamlit Cloud / Docker:</strong> One-click containerized deployment to GCP or Streamlit Community Cloud.</div>
                  <div>5. <strong>Monte Carlo FIRE Simulation:</strong> Geometric Brownian motion simulation for long-term retirement planning.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
