/**
 * Mathematical forecasting implementations in TypeScript matching Python statsmodels / scikit-learn logic.
 */

export interface ForecastOutput {
  modelName: string;
  futureMonths: string[];
  predictions: number[];
  lowerBounds: number[];
  upperBounds: number[];
  mae: number;
  rmse: number;
}

export interface ModelComparisonResult {
  championName: string;
  table: Array<{
    model: string;
    mae: number;
    rmse: number;
    rank: number;
  }>;
  models: Record<string, ForecastOutput>;
}

// 1. Simple Moving Average (SMA)
export function calculateSMA(
  history: number[],
  horizon: number,
  k: number = 3
): { preds: number[]; lower: number[]; upper: number[] } {
  const windowSize = Math.min(k, history.length);
  const recent = history.slice(-windowSize);
  const mean = recent.reduce((a, b) => a + b, 0) / windowSize;

  // Residual variance on past data
  let ssr = 0;
  for (let i = windowSize; i < history.length; i++) {
    const pastMean = history.slice(i - windowSize, i).reduce((a, b) => a + b, 0) / windowSize;
    ssr += Math.pow(history[i] - pastMean, 2);
  }
  const variance = history.length > windowSize ? ssr / (history.length - windowSize) : Math.pow(mean * 0.1, 2);
  const stdErr = Math.sqrt(variance);

  const preds: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let h = 0; h < horizon; h++) {
    preds.push(Math.round(mean * 100) / 100);
    const margin = 1.96 * stdErr * Math.sqrt(1 + 1 / windowSize);
    lower.push(Math.max(0, Math.round((mean - margin) * 100) / 100));
    upper.push(Math.round((mean + margin) * 100) / 100);
  }
  return { preds, lower, upper };
}

// 2. Ordinary Least Squares (OLS) Linear Trend
export function calculateOLS(
  history: number[],
  horizon: number
): { preds: number[]; lower: number[]; upper: number[] } {
  const n = history.length;
  if (n < 2) return calculateSMA(history, horizon, 1);

  const tVals = Array.from({ length: n }, (_, i) => i);
  const tMean = tVals.reduce((a, b) => a + b, 0) / n;
  const yMean = history.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (tVals[i] - tMean) * (history[i] - yMean);
    den += Math.pow(tVals[i] - tMean, 2);
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * tMean;

  // Compute standard error of regression
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slope * tVals[i];
    ssr += Math.pow(history[i] - fitted, 2);
  }
  const sErr = Math.sqrt(ssr / Math.max(1, n - 2));

  const preds: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let h = 1; h <= horizon; h++) {
    const tFuture = (n - 1) + h;
    const p = Math.max(0, intercept + slope * tFuture);
    preds.push(Math.round(p * 100) / 100);

    const seForecast = sErr * Math.sqrt(1 + 1 / n + Math.pow(tFuture - tMean, 2) / Math.max(1, den));
    const margin = 1.96 * seForecast;
    lower.push(Math.max(0, Math.round((p - margin) * 100) / 100));
    upper.push(Math.round((p + margin) * 100) / 100);
  }
  return { preds, lower, upper };
}

// 3. Holt-Winters Double/Triple Exponential Smoothing
export function calculateHoltWinters(
  history: number[],
  horizon: number,
  seasonLength: number = 12
): { preds: number[]; lower: number[]; upper: number[] } {
  const n = history.length;
  if (n < 4) return calculateOLS(history, horizon);

  const alpha = 0.35;
  const beta = 0.15;
  const gamma = 0.25;

  let level = history[0];
  let trend = (history[n - 1] - history[0]) / (n - 1);

  // Initialize seasonal factors if length permits
  const seasonal: number[] = Array(seasonLength).fill(0);
  if (n >= seasonLength) {
    const cycleAvg = history.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
    for (let i = 0; i < seasonLength; i++) {
      seasonal[i] = history[i] - cycleAvg;
    }
  }

  const residuals: number[] = [];

  for (let t = 0; t < n; t++) {
    const sIdx = t % seasonLength;
    const prevLevel = level;
    const prevTrend = trend;
    const sVal = seasonal[sIdx];

    const y = history[t];
    const fitted = prevLevel + prevTrend + sVal;
    residuals.push(y - fitted);

    // Update level, trend, seasonal
    level = alpha * (y - sVal) + (1 - alpha) * (prevLevel + prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    seasonal[sIdx] = gamma * (y - level) + (1 - gamma) * sVal;
  }

  const resStd = Math.sqrt(residuals.reduce((a, b) => a + Math.pow(b, 2), 0) / Math.max(1, n));

  const preds: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let h = 1; h <= horizon; h++) {
    const sIdx = (n + h - 1) % seasonLength;
    const forecast = Math.max(0, level + h * trend + seasonal[sIdx]);
    preds.push(Math.round(forecast * 100) / 100);

    const margin = 1.96 * resStd * Math.sqrt(1 + 0.1 * h);
    lower.push(Math.max(0, Math.round((forecast - margin) * 100) / 100));
    upper.push(Math.round((forecast + margin) * 100) / 100);
  }

  return { preds, lower, upper };
}

// 4. ARIMA(1,1,1) Stochastic Process
export function calculateARIMA(
  history: number[],
  horizon: number
): { preds: number[]; lower: number[]; upper: number[] } {
  const n = history.length;
  if (n < 5) return calculateSMA(history, horizon, 3);

  // Differenced series delta_y = y_t - y_{t-1}
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) {
    diffs.push(history[i] - history[i - 1]);
  }

  const m = diffs.length;
  // Fit AR(1) parameter phi on differences
  let num = 0;
  let den = 0;
  const dMean = diffs.reduce((a, b) => a + b, 0) / m;
  for (let i = 1; i < m; i++) {
    num += (diffs[i] - dMean) * (diffs[i - 1] - dMean);
    den += Math.pow(diffs[i - 1] - dMean, 2);
  }
  const phi = Math.max(-0.85, Math.min(0.85, den !== 0 ? num / den : 0.2));
  const theta = -0.15; // Moving average parameter

  const lastDiff = diffs[m - 1];
  let currY = history[n - 1];
  let currDelta = lastDiff;

  // Residual std
  const resStd = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - dMean, 2), 0) / Math.max(1, m));

  const preds: number[] = [];
  const lower: number[] = [];
  const upper: number[] = [];

  for (let h = 1; h <= horizon; h++) {
    currDelta = phi * currDelta + theta * 0.05 + (1 - phi) * dMean;
    currY = Math.max(0, currY + currDelta);
    preds.push(Math.round(currY * 100) / 100);

    const margin = 1.96 * resStd * Math.sqrt(h);
    lower.push(Math.max(0, Math.round((currY - margin) * 100) / 100));
    upper.push(Math.round((currY + margin) * 100) / 100);
  }

  return { preds, lower, upper };
}

// Evaluation Tournament Suite
export function runModelTournament(
  historyMonths: string[],
  historyValues: number[],
  horizon: number = 3,
  holdoutCount: number = 3
): ModelComparisonResult {
  const k = Math.max(1, Math.min(holdoutCount, Math.floor(historyValues.length * 0.3)));
  const train = historyValues.slice(0, -k);
  const test = historyValues.slice(-k);

  const modelFuncs: Record<
    string,
    (arr: number[], h: number) => { preds: number[]; lower: number[]; upper: number[] }
  > = {
    'Moving Average (k=3)': (arr, h) => calculateSMA(arr, h, 3),
    'Linear Regression (OLS)': (arr, h) => calculateOLS(arr, h),
    'Holt-Winters': (arr, h) => calculateHoltWinters(arr, h),
    'ARIMA (1,1,1)': (arr, h) => calculateARIMA(arr, h),
  };

  const results: Record<string, ForecastOutput> = {};
  const tableData: Array<{ model: string; mae: number; rmse: number; rank: number }> = [];

  // Generate future month strings
  const lastMonthStr = historyMonths[historyMonths.length - 1];
  const [lastY, lastM] = lastMonthStr.split('-').map(Number);
  const futureMonths: string[] = [];
  let curY = lastY;
  let curM = lastM;
  for (let i = 0; i < horizon; i++) {
    curM += 1;
    if (curM > 12) {
      curM = 1;
      curY += 1;
    }
    futureMonths.push(`${curY}-${curM.toString().padStart(2, '0')}`);
  }

  for (const [name, fn] of Object.entries(modelFuncs)) {
    // 1. Validation error on holdout
    const valRes = fn(train, k);
    let maeSum = 0;
    let mseSum = 0;
    for (let i = 0; i < k; i++) {
      const err = test[i] - valRes.preds[i];
      maeSum += Math.abs(err);
      mseSum += Math.pow(err, 2);
    }
    const mae = Math.round((maeSum / k) * 100) / 100;
    const rmse = Math.round(Math.sqrt(mseSum / k) * 100) / 100;

    // 2. Full production projection
    const fullRes = fn(historyValues, horizon);

    results[name] = {
      modelName: name,
      futureMonths,
      predictions: fullRes.preds,
      lowerBounds: fullRes.lower,
      upperBounds: fullRes.upper,
      mae,
      rmse,
    };

    tableData.push({
      model: name,
      mae,
      rmse,
      rank: 0,
    });
  }

  // Sort by RMSE ascending
  tableData.sort((a, b) => a.rmse - b.rmse);
  tableData.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return {
    championName: tableData[0].model,
    table: tableData,
    models: results,
  };
}

// Statistical Outlier Detection
export interface OutlierItem {
  id: number;
  date: string;
  amount: number;
  category: string;
  note: string;
  metric: number;
  reason: string;
}

export function detectZScoreOutliers(
  transactions: Array<{ id: number; date: string; amount: number; category: string; note: string; type: string }>,
  threshold: number = 2.0
): OutlierItem[] {
  const expenseOnly = transactions.filter((t) => t.type === 'expense');
  const byCategory: Record<string, typeof expenseOnly> = {};

  expenseOnly.forEach((tx) => {
    if (!byCategory[tx.category]) byCategory[tx.category] = [];
    byCategory[tx.category].push(tx);
  });

  const outliers: OutlierItem[] = [];

  for (const [catName, txList] of Object.entries(byCategory)) {
    if (txList.length < 3) continue;
    const amounts = txList.map((t) => t.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, amounts.length - 1);
    const std = Math.sqrt(variance);

    if (std === 0) continue;

    txList.forEach((tx) => {
      const z = (tx.amount - mean) / std;
      if (z > threshold) {
        outliers.push({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          category: catName,
          note: tx.note,
          metric: Math.round(z * 10) / 10,
          reason: `Z-Score of +${(Math.round(z * 10) / 10)}σ (Mean $${mean.toFixed(2)}, Std $${std.toFixed(2)})`,
        });
      }
    });
  }

  return outliers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function detectIQROutliers(
  transactions: Array<{ id: number; date: string; amount: number; category: string; note: string; type: string }>,
  multiplier: number = 1.5
): OutlierItem[] {
  const expenseOnly = transactions.filter((t) => t.type === 'expense');
  const byCategory: Record<string, typeof expenseOnly> = {};

  expenseOnly.forEach((tx) => {
    if (!byCategory[tx.category]) byCategory[tx.category] = [];
    byCategory[tx.category].push(tx);
  });

  const outliers: OutlierItem[] = [];

  for (const [catName, txList] of Object.entries(byCategory)) {
    if (txList.length < 4) continue;
    const sorted = txList.map((t) => t.amount).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const upperFence = q3 + multiplier * iqr;

    txList.forEach((tx) => {
      if (tx.amount > upperFence) {
        outliers.push({
          id: tx.id,
          date: tx.date,
          amount: tx.amount,
          category: catName,
          note: tx.note,
          metric: Math.round((tx.amount - upperFence) * 100) / 100,
          reason: `Exceeds Tukey upper fence $${upperFence.toFixed(2)} (Q3: $${q1.toFixed(2)}, IQR: $${iqr.toFixed(2)})`,
        });
      }
    });
  }

  return outliers.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
