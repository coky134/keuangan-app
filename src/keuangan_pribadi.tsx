import { useState, useMemo, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  Wallet, CreditCard, ArrowRightLeft, 
  TrendingUp, TrendingDown, Activity, 
  PieChart, ShieldCheck, Heart, Target, Zap,
  Send, Landmark, Trash2, LogOut, Lock
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- INTERFACES ---
interface Account {
  id: string;
  name: string;
  balance: number;
  icon?: any;
  color: string;
  currency: 'JPY' | 'IDR';
}

interface Budget {
  id: string;
  name: string;
  percent: number;
  allocated: number;
  spent: number;
  color: string;
  icon?: any;
}

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: 'JPY' | 'IDR';
  desc: string;
  date: string;
  sourceAccount: string | null;
  destAccount: string | null;
  budgetId: string | null;
}

// --- INITIAL DATA ---
const INITIAL_ACCOUNTS: Account[] = [
  { id: 'dompet', name: 'Dompet Tunai', balance: 0, icon: Wallet, color: 'green', currency: 'JPY' },
  { id: 'kyodai', name: 'Kyodai Remittance', balance: 0, icon: Send, color: 'blue', currency: 'JPY' },
  { id: 'bsi', name: 'BSI (Transit)', balance: 0, icon: Landmark, color: 'emerald', currency: 'IDR' },
  { id: 'seabank', name: 'SeaBank (Hub)', balance: 0, icon: Zap, color: 'orange', currency: 'IDR' }
];

const INITIAL_BUDGETS: Budget[] = [
  { id: 'kebutuhan', name: 'Kebutuhan Pokok', percent: 0.40, allocated: 0, spent: 0, color: 'cyan', icon: CreditCard },
  { id: 'masa_depan', name: 'Masa Depan', percent: 0.25, allocated: 0, spent: 0, color: 'emerald', icon: ShieldCheck },
  { id: 'keinginan', name: 'Keinginan & Hobi', percent: 0.20, allocated: 0, spent: 0, color: 'amber', icon: Heart },
  { id: 'kewajiban', name: 'Kewajiban', percent: 0.15, allocated: 0, spent: 0, color: 'orange', icon: Target }
];

export default function KeuanganPribadi() {
  // --- AUTH STATE ---
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // --- APP STATE ---
  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);
  const [budgets, setBudgets] = useState<Budget[]>(INITIAL_BUDGETS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // UI Tabs
  const [activeTab, setActiveTab] = useState<'income' | 'expense' | 'transfer'>('income');
  
  // Form State
  const [amount, setAmount] = useState<string>('');
  const [desc, setDesc] = useState<string>('');
  const [sourceAccount, setSourceAccount] = useState<string>('kyodai');
  const [destAccount, setDestAccount] = useState<string>('kyodai');
  const [targetBudget, setTargetBudget] = useState<string>('kebutuhan');
  const [transferBudget, setTransferBudget] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<number>(105);

  // --- LISTEN AUTH STATE ---
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAdmin(true);
        setUserId(user.uid);
        setUserEmail(user.email);
      } else {
        setIsAdmin(false);
        setUserId(null);
        setUserEmail(null);
      }
      setIsAuthChecking(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // --- FIREBASE SYNC PER-USER (DINAMIS Sesuai user.uid) ---
  useEffect(() => {
    if (!userId) return;

    // Path Dokumen User: users/{userId}
    const docRef = doc(db, 'users', userId);
    const unsubDoc = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAccounts(data.accounts || INITIAL_ACCOUNTS);
        setBudgets(data.budgets || INITIAL_BUDGETS);
        if (data.exchangeRate) setExchangeRate(data.exchangeRate);
      } else {
        // Jika akun user baru pertama kali login, buatkan template data awal
        await setDoc(docRef, {
          accounts: INITIAL_ACCOUNTS.map(({icon, ...rest}) => rest),
          budgets: INITIAL_BUDGETS.map(({icon, ...rest}) => rest),
          exchangeRate: 105
        });
      }
    });

    // Sub-koleksi Transaksi: users/{userId}/transactions
    const txRef = collection(db, 'users', userId, 'transactions');
    const unsubTx = onSnapshot(txRef, (snapshot) => {
      const txData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Transaction[];
      txData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(txData);
    });

    return () => {
      unsubDoc();
      unsubTx();
    };
  }, [userId]);

  // --- COMPUTED DATA WITH ICONS ---
  const accountsWithIcons = accounts.map(acc => ({
    ...acc,
    icon: INITIAL_ACCOUNTS.find(a => a.id === acc.id)?.icon || Wallet
  }));

  const budgetsWithIcons = budgets.map(b => ({
    ...b,
    icon: INITIAL_BUDGETS.find(ib => ib.id === b.id)?.icon || PieChart
  }));

  const totalBalanceJPY = useMemo(() => accounts.reduce((acc, curr) => {
    return acc + (curr.currency === 'IDR' ? curr.balance / exchangeRate : curr.balance);
  }, 0), [accounts, exchangeRate]);

  // --- UTILS ---
  const formatCurrency = (val: number, currency: 'JPY' | 'IDR' = 'JPY') => {
    if (currency === 'IDR') {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);
    }
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(val || 0);
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // --- AUTH HANDLER ---
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Gagal login! Periksa email dan password.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const updateExchangeRate = async (newRate: number) => {
    setExchangeRate(newRate);
    if (newRate > 0 && userId) {
      await updateDoc(doc(db, 'users', userId), { exchangeRate: newRate });
    }
  };

  // --- TRANSACTION HANDLERS ---
  const handleTransaction = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const val = Number(amount);
    if (!val || val <= 0) return;

    const srcAccObj = accounts.find(a => a.id === sourceAccount);
    const dstAccObj = accounts.find(a => a.id === destAccount);
    const activeAcc = activeTab === 'income' ? dstAccObj : srcAccObj;
    
    if (!activeAcc) return;

    const valInJPY = activeAcc.currency === 'IDR' ? val / exchangeRate : val;
    let finalBudgetId: string | null = null;

    let nextAccounts = [...accounts];
    let nextBudgets = [...budgets];

    if (activeTab === 'income') {
      nextAccounts = nextAccounts.map(acc => 
        acc.id === destAccount ? { ...acc, balance: acc.balance + val } : acc
      );
      nextBudgets = nextBudgets.map(b => ({
        ...b,
        allocated: b.allocated + (valInJPY * b.percent)
      }));
    } 
    else if (activeTab === 'expense') {
      finalBudgetId = targetBudget;
      nextAccounts = nextAccounts.map(acc => 
        acc.id === sourceAccount ? { ...acc, balance: acc.balance - val } : acc
      );
      nextBudgets = nextBudgets.map(b => 
        b.id === targetBudget ? { ...b, spent: b.spent + valInJPY } : b
      );
    }
    else if (activeTab === 'transfer') {
      if (sourceAccount === destAccount || !srcAccObj || !dstAccObj) return;
      
      let destVal = val;
      if (srcAccObj.currency === 'JPY' && dstAccObj.currency === 'IDR') {
        destVal = val * exchangeRate;
      } else if (srcAccObj.currency === 'IDR' && dstAccObj.currency === 'JPY') {
        destVal = val / exchangeRate;
      }

      finalBudgetId = transferBudget || null;

      nextAccounts = nextAccounts.map(acc => {
        if (acc.id === sourceAccount) return { ...acc, balance: acc.balance - val };
        if (acc.id === destAccount) return { ...acc, balance: acc.balance + destVal };
        return acc;
      });

      if (finalBudgetId) {
        nextBudgets = nextBudgets.map(b => 
          b.id === finalBudgetId ? { ...b, spent: b.spent + valInJPY } : b
        );
      }
    }

    const newTx: Transaction = {
      id: generateId(),
      type: activeTab,
      amount: val,
      currency: activeAcc.currency,
      desc: desc || (activeTab === 'income' ? 'Pemasukan' : activeTab === 'expense' ? 'Pengeluaran' : 'Transfer'),
      date: new Date().toISOString(),
      sourceAccount: activeTab !== 'income' ? sourceAccount : null,
      destAccount: activeTab !== 'expense' ? destAccount : null,
      budgetId: finalBudgetId,
    };

    try {
      // Simpan ke path users/{userId}
      await updateDoc(doc(db, 'users', userId), {
        accounts: nextAccounts.map(({icon, ...rest}) => rest),
        budgets: nextBudgets.map(({icon, ...rest}) => rest)
      });
      await setDoc(doc(db, 'users', userId, 'transactions', newTx.id), newTx);
      
      setAmount('');
      setDesc('');
      setTransferBudget('');
    } catch (error) {
      console.error("Gagal memproses transaksi:", error);
      alert("Koneksi database bermasalah.");
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!userId) return;

    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    const val = tx.amount;
    const valInJPY = tx.currency === 'IDR' ? val / exchangeRate : val;

    let nextAccounts = [...accounts];
    let nextBudgets = [...budgets];

    if (tx.type === 'income') {
      nextAccounts = nextAccounts.map(acc => 
        acc.id === tx.destAccount ? { ...acc, balance: acc.balance - val } : acc
      );
      nextBudgets = nextBudgets.map(b => ({
        ...b,
        allocated: b.allocated - (valInJPY * b.percent)
      }));
    } 
    else if (tx.type === 'expense') {
      nextAccounts = nextAccounts.map(acc => 
        acc.id === tx.sourceAccount ? { ...acc, balance: acc.balance + val } : acc
      );
      nextBudgets = nextBudgets.map(b => 
        b.id === tx.budgetId ? { ...b, spent: b.spent - valInJPY } : b
      );
    } 
    else if (tx.type === 'transfer') {
      const srcAccObj = accounts.find(a => a.id === tx.sourceAccount);
      const dstAccObj = accounts.find(a => a.id === tx.destAccount);
      
      let destVal = val;
      if (srcAccObj && dstAccObj) {
        if (srcAccObj.currency === 'JPY' && dstAccObj.currency === 'IDR') {
          destVal = val * exchangeRate;
        } else if (srcAccObj.currency === 'IDR' && dstAccObj.currency === 'JPY') {
          destVal = val / exchangeRate;
        }
      }

      nextAccounts = nextAccounts.map(acc => {
        if (acc.id === tx.sourceAccount) return { ...acc, balance: acc.balance + val };
        if (acc.id === tx.destAccount) return { ...acc, balance: acc.balance - destVal };
        return acc;
      });

      if (tx.budgetId) {
        nextBudgets = nextBudgets.map(b => 
          b.id === tx.budgetId ? { ...b, spent: b.spent - valInJPY } : b
        );
      }
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        accounts: nextAccounts.map(({icon, ...rest}) => rest),
        budgets: nextBudgets.map(({icon, ...rest}) => rest)
      });
      await deleteDoc(doc(db, 'users', userId, 'transactions', id));
    } catch (error) {
      console.error("Gagal menghapus:", error);
    }
  };

  const getBudgetColor = (colorId: string) => {
    const colors: Record<string, string> = {
      cyan: 'from-cyan-400 to-blue-500 text-cyan-400 shadow-cyan-500/50',
      emerald: 'from-emerald-400 to-green-500 text-emerald-400 shadow-emerald-500/50',
      amber: 'from-amber-400 to-orange-500 text-amber-400 shadow-amber-500/50',
      orange: 'from-orange-400 to-red-500 text-orange-400 shadow-orange-500/50',
    };
    return colors[colorId] || colors.cyan;
  };

  // --- LOADING / LOGIN SCREEN ---
  if (isAuthChecking) {
    return <div className="min-h-screen bg-[#060913] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#060913] flex items-center justify-center font-sans bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#111A33] via-[#060913] to-[#000000] p-4 text-slate-200">
        <div className="bg-white/5 backdrop-blur-2xl p-8 md:p-10 rounded-[2rem] border border-white/10 shadow-2xl w-full max-w-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/20 blur-[70px] rounded-full pointer-events-none"></div>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400"><Lock className="w-6 h-6" /></div>
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Admin Login</h2>
          </div>
          <p className="text-slate-400 font-medium mb-8">Autentikasi diperlukan untuk akses database</p>
          
          <form onSubmit={handleLogin} className="space-y-5 relative z-10">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Admin</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl focus:bg-black/50 outline-none transition-all font-medium text-white focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl focus:bg-black/50 outline-none transition-all font-medium text-white focus:border-cyan-500" />
            </div>
            <button type="submit" disabled={isLoggingIn} className="w-full mt-2 font-bold py-4 rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg disabled:opacity-50 hover:shadow-cyan-500/20 transition-all">
              {isLoggingIn ? 'Memeriksa Kredensial...' : 'Masuk Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD SCREEN ---
  return (
    <div className="min-h-screen bg-[#060913] text-slate-200 p-4 md:p-6 lg:p-8 font-sans bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#111A33] via-[#060913] to-[#000000] selection:bg-cyan-500/30 overflow-x-hidden">
      
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto space-y-8 relative z-10">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 p-8 rounded-[2rem] bg-white/5 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/20 blur-[80px] rounded-full pointer-events-none"></div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-widest uppercase mb-4 shadow-[0_0_15px_rgba(0,242,254,0.15)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              Akun: {userEmail}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
              Finance Pro
            </h1>
            <p className="text-slate-400 font-medium mb-4">Auto-Split Budget & Multi-Currency</p>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 bg-black/20 p-2 rounded-xl border border-white/5 w-fit">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2">Kurs: 1 JPY =</span>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">Rp</span>
                  <input 
                    type="number" 
                    value={exchangeRate} 
                    onChange={(e) => updateExchangeRate(Number(e.target.value) || 0)}
                    className="w-24 pl-8 pr-2 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white font-bold outline-none focus:border-cyan-500 transition-colors text-sm"
                  />
                </div>
              </div>
              <button onClick={() => signOut(auth)} className="flex items-center gap-2 px-4 py-2.5 bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500/20 border border-rose-500/20 transition-all font-bold text-sm">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
          
          <div className="bg-black/40 p-6 rounded-3xl border border-white/5 w-full md:w-auto flex flex-col items-start md:items-end backdrop-blur-md shadow-inner">
            <p className="text-sm text-slate-400 font-medium mb-1 uppercase tracking-widest">Total Liquid Assets (Equiv.)</p>
            <p className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_0_10px_rgba(0,242,254,0.3)]">
              {formatCurrency(totalBalanceJPY, 'JPY')}
            </p>
          </div>
        </header>

        {/* ACCOUNTS */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-cyan-400" /> Lokasi Uang
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {accountsWithIcons.map(acc => {
              const Icon = acc.icon;
              return (
                <div key={acc.id} className="bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 p-6 hover:bg-white/10 transition-all duration-300 group overflow-hidden relative">
                  <div className="flex items-center gap-4 mb-4 relative z-10">
                    <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 shadow-inner text-cyan-400 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-300 text-lg tracking-wide">{acc.name}</h3>
                      <p className="text-xs text-slate-500 font-bold bg-white/5 inline-block px-2 py-0.5 rounded mt-1">{acc.currency}</p>
                    </div>
                  </div>
                  <p className="text-3xl font-black text-white relative z-10 drop-shadow-md">
                    {formatCurrency(acc.balance, acc.currency)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* BUDGETS */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-purple-400" /> Anggaran (Patokan JPY)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {budgetsWithIcons.map(b => {
              const remaining = b.allocated - b.spent;
              const isOver = remaining < 0;
              const progress = b.allocated > 0 ? Math.min((b.spent / b.allocated) * 100, 100) : 0;
              const style = getBudgetColor(b.color);
              const Icon = b.icon;

              return (
                <div key={b.id} className="bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 p-6 hover:bg-white/10 transition-all duration-500 group relative">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-purple-400">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-200">{b.name}</h3>
                        <p className="text-xs text-slate-400">{b.percent * 100}% Alokasi</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 mb-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Sisa Jatah</p>
                    <p className={`text-2xl font-black tracking-tight ${isOver ? 'text-red-400' : 'text-white'}`}>
                      {formatCurrency(remaining)}
                    </p>
                  </div>

                  <div className="pt-3">
                    <div className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                      <span>Terpakai: {formatCurrency(b.spent)}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${isOver ? 'from-red-600 to-rose-400' : style.split(' ')[0]} shadow-lg relative`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* FORMS & HISTORY */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* Action Terminal */}
          <div className="xl:col-span-5 bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 overflow-hidden flex flex-col shadow-2xl relative">
            <div className="flex border-b border-white/10 bg-black/20">
              <button onClick={() => setActiveTab('income')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'income' ? 'bg-white/10 text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <TrendingUp className="w-4 h-4" /> Pemasukan
              </button>
              <button onClick={() => setActiveTab('expense')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'expense' ? 'bg-white/10 text-rose-400 border-b-2 border-rose-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <TrendingDown className="w-4 h-4" /> Pengeluaran
              </button>
              <button onClick={() => setActiveTab('transfer')} className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'transfer' ? 'bg-white/10 text-purple-400 border-b-2 border-purple-400' : 'text-slate-500 hover:text-slate-300'}`}>
                <ArrowRightLeft className="w-4 h-4" /> Pindah Uang
              </button>
            </div>

            <div className="p-6 md:p-8">
              <form onSubmit={handleTransaction} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Nominal ({activeTab === 'income' ? accounts.find(a=>a.id===destAccount)?.currency : accounts.find(a=>a.id===sourceAccount)?.currency})
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                        {(activeTab === 'income' ? accounts.find(a=>a.id===destAccount)?.currency : accounts.find(a=>a.id===sourceAccount)?.currency) === 'IDR' ? 'Rp' : '¥'}
                      </span>
                      <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-10 pr-4 py-3.5 bg-black/30 border border-white/10 rounded-xl focus:bg-black/50 outline-none transition-all font-medium text-white focus:border-cyan-500"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Keterangan</label>
                    <input type="text" required value={desc} onChange={(e) => setDesc(e.target.value)}
                      className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white outline-none"
                      placeholder={activeTab === 'income' ? 'Gaji / Bonus' : activeTab === 'expense' ? 'Makan / Jajan' : 'Tarik Tunai / Kirim'}
                    />
                  </div>
                </div>

                {activeTab === 'income' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Masuk Ke Rekening</label>
                    <select value={destAccount} onChange={(e) => setDestAccount(e.target.value)} className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white outline-none cursor-pointer [&>option]:bg-slate-900">
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                    </select>
                  </div>
                )}

                {activeTab === 'expense' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ambil Dari</label>
                      <select value={sourceAccount} onChange={(e) => setSourceAccount(e.target.value)} className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white outline-none cursor-pointer [&>option]:bg-slate-900">
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Potong Anggaran</label>
                      <select value={targetBudget} onChange={(e) => setTargetBudget(e.target.value)} className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white outline-none cursor-pointer [&>option]:bg-slate-900">
                        {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {activeTab === 'transfer' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Dari Rekening</label>
                        <select value={sourceAccount} onChange={(e) => setSourceAccount(e.target.value)} className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white outline-none cursor-pointer [&>option]:bg-slate-900">
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ke Rekening</label>
                        <select value={destAccount} onChange={(e) => setDestAccount(e.target.value)} className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white outline-none cursor-pointer [&>option]:bg-slate-900">
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                      <label className="block text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">
                        Potong Anggaran Sekaligus? (Opsional)
                      </label>
                      <select value={transferBudget} onChange={(e) => setTransferBudget(e.target.value)} className="w-full px-4 py-3 bg-black/50 border border-purple-500/30 rounded-lg text-white outline-none cursor-pointer [&>option]:bg-slate-900">
                        <option value="">-- Tidak Dipotong --</option>
                        {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <button type="submit" className="w-full mt-4 font-bold py-4 px-6 rounded-xl text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-lg">
                  Proses Transaksi
                </button>
              </form>
            </div>
          </div>

          {/* Ledger / History */}
          <div className="xl:col-span-7 bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 flex flex-col h-[650px] overflow-hidden shadow-2xl relative">
            <div className="p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-black/20">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Activity className="w-6 h-6" /> Riwayat Transaksi
              </h2>
            </div>
            
            <div className="p-6 md:p-8 flex-1 overflow-auto">
              {transactions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10">
                  <Activity className="w-8 h-8 text-slate-600 mb-4" />
                  <p className="text-lg font-medium text-slate-400">Belum ada aktivitas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map(t => {
                    const isInc = t.type === 'income';
                    const isExp = t.type === 'expense';
                    const isTrf = t.type === 'transfer';
                    
                    const accSrc = accounts.find(a => a.id === t.sourceAccount);
                    const accDst = accounts.find(a => a.id === t.destAccount);
                    const budg = budgets.find(b => b.id === t.budgetId);

                    return (
                      <div key={t.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-black/20 border border-white/5 rounded-2xl gap-4 hover:bg-black/30 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${isInc ? 'bg-cyan-500/10 text-cyan-400' : isExp ? 'bg-rose-500/10 text-rose-400' : 'bg-purple-500/10 text-purple-400'}`}>
                            {isInc ? <TrendingUp className="w-5 h-5" /> : isExp ? <TrendingDown className="w-5 h-5" /> : <ArrowRightLeft className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-200 text-lg">{t.desc}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                              <span>{new Date(t.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                              {isInc && <span className="px-2 py-0.5 bg-cyan-500/15 text-cyan-300 rounded">Masuk ke {accDst?.name}</span>}
                              {isExp && <span className="px-2 py-0.5 bg-rose-500/15 text-rose-300 rounded">Pos {budg?.name}</span>}
                              {isTrf && <span className="px-2 py-0.5 bg-purple-500/15 text-purple-300 rounded">{accSrc?.name} → {accDst?.name}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4">
                          <span className={`text-xl font-black ${isInc ? 'text-cyan-400' : isExp ? 'text-white' : 'text-purple-400'}`}>
                            {isInc ? '+' : isExp ? '-' : ''}{formatCurrency(t.amount, t.currency)}
                          </span>
                          <button onClick={() => handleDeleteTransaction(t.id)} className="p-2 text-slate-400 hover:text-rose-400 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}