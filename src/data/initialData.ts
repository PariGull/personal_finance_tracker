export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  color: string;
}

export interface Budget {
  id: number;
  categoryId: number;
  monthlyLimit: number;
  yearMonth: string;
}

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  categoryId: number;
  note: string;
}

export const INITIAL_CATEGORIES: Category[] = [
  { id: 1, name: 'Salary', type: 'income', color: '#10B981' },
  { id: 2, name: 'Investments & Freelance', type: 'income', color: '#059669' },
  { id: 3, name: 'Housing & Rent', type: 'expense', color: '#EF4444' },
  { id: 4, name: 'Groceries', type: 'expense', color: '#F59E0B' },
  { id: 5, name: 'Utilities & Bills', type: 'expense', color: '#3B82F6' },
  { id: 6, name: 'Dining & Social', type: 'expense', color: '#EC4899' },
  { id: 7, name: 'Transportation', type: 'expense', color: '#8B5CF6' },
  { id: 8, name: 'Healthcare', type: 'expense', color: '#14B8A6' },
  { id: 9, name: 'Entertainment', type: 'expense', color: '#6366F1' },
  { id: 10, name: 'Miscellaneous', type: 'expense', color: '#6B7280' },
];

export const INITIAL_BUDGETS: Record<number, number> = {
  3: 1500, // Housing
  4: 550,  // Groceries
  5: 220,  // Utilities
  6: 350,  // Dining
  7: 180,  // Transportation
  8: 150,  // Healthcare
  9: 200,  // Entertainment
  10: 150, // Misc
};

// Generates 18 months of realistic transactional history starting from 2025-05 to 2026-10
export function generateSeedTransactions(): Transaction[] {
  const transactions: Transaction[] = [];
  let idCounter = 1;

  const months = [
    '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10',
    '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'
  ];

  months.forEach((ym, mIdx) => {
    // 1. Bi-monthly salary
    transactions.push({
      id: idCounter++,
      date: `${ym}-01`,
      amount: 3150,
      categoryId: 1,
      note: 'Bi-weekly Corporate Salary',
    });
    transactions.push({
      id: idCounter++,
      date: `${ym}-15`,
      amount: 3150,
      categoryId: 1,
      note: 'Bi-weekly Corporate Salary',
    });

    // Occasional freelance
    if (mIdx % 2 === 0) {
      transactions.push({
        id: idCounter++,
        date: `${ym}-22`,
        amount: 350 + (mIdx * 25),
        categoryId: 2,
        note: 'Freelance Math Tutoring & Dividends',
      });
    }

    // 2. Housing
    transactions.push({
      id: idCounter++,
      date: `${ym}-01`,
      amount: 1450,
      categoryId: 3,
      note: 'Apartment Monthly Rent',
    });

    // 3. Utilities (summer & winter peaks)
    const isSummerOrWinter = [1, 2, 7, 8].includes(parseInt(ym.split('-')[1]));
    const utilAmt = isSummerOrWinter ? 210 + (mIdx % 3) * 12 : 145 + (mIdx % 4) * 8;
    transactions.push({
      id: idCounter++,
      date: `${ym}-10`,
      amount: utilAmt,
      categoryId: 5,
      note: 'Electricity, Gas & Fiber Internet',
    });

    // 4. Groceries (4 weeks)
    const baseGroc = 115 + (mIdx * 3); // subtle inflation upward trend
    [4, 11, 18, 25].forEach((day) => {
      transactions.push({
        id: idCounter++,
        date: `${ym}-${day.toString().padStart(2, '0')}`,
        amount: baseGroc + ((day % 3) * 15),
        categoryId: 4,
        note: 'Weekly Supermarket Restock',
      });
    });

    // 5. Dining & Social (multiple transactions)
    const diningSpends = [35, 52, 44, 68, 29];
    [5, 12, 19, 23, 27].forEach((day, dIdx) => {
      transactions.push({
        id: idCounter++,
        date: `${ym}-${day.toString().padStart(2, '0')}`,
        amount: diningSpends[dIdx],
        categoryId: 6,
        note: dIdx % 2 === 0 ? 'Dinner with peers' : 'Weekend brunch & coffee',
      });
    });

    // 6. Transportation
    transactions.push({
      id: idCounter++,
      date: `${ym}-06`,
      amount: 55,
      categoryId: 7,
      note: 'Metro pass reload',
    });
    transactions.push({
      id: idCounter++,
      date: `${ym}-20`,
      amount: 60,
      categoryId: 7,
      note: 'Gasoline refill',
    });

    // 7. Entertainment
    transactions.push({
      id: idCounter++,
      date: `${ym}-14`,
      amount: 65 + (mIdx % 4) * 10,
      categoryId: 9,
      note: 'Concert & Streaming subs',
    });

    // 8. Healthcare
    if (mIdx % 3 === 0) {
      transactions.push({
        id: idCounter++,
        date: `${ym}-16`,
        amount: 85,
        categoryId: 8,
        note: 'Dental & Prescription co-pay',
      });
    }
  });

  // Intentional anomalies
  transactions.push({
    id: idCounter++,
    date: '2025-08-16',
    amount: 620,
    categoryId: 7,
    note: 'Emergency transmission & brake repairs',
  });
  transactions.push({
    id: idCounter++,
    date: '2025-12-18',
    amount: 480,
    categoryId: 6,
    note: 'Annual holiday banquet with department',
  });
  transactions.push({
    id: idCounter++,
    date: '2026-03-24',
    amount: 510,
    categoryId: 8,
    note: 'Emergency dental crown procedure',
  });
  transactions.push({
    id: idCounter++,
    date: '2026-07-11',
    amount: 690,
    categoryId: 9,
    note: 'Roundtrip flight tickets to Math Conference',
  });
  transactions.push({
    id: idCounter++,
    date: '2026-09-08',
    amount: 380,
    categoryId: 4,
    note: 'Costco annual bulk pantry restocking',
  });

  return transactions;
}
