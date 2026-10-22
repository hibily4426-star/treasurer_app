"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  Check,
  Clock3,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  PackageOpen,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  Trash2,
  TrendingUp,
  Utensils,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardData, Product, Sale } from "@/lib/types";

type View = "overview" | "sales" | "products" | "menu" | "hours" | "refunds";

const VIEWS: Array<{
  id: View;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "概要", icon: LayoutDashboard },
  { id: "sales", label: "今日の売上", icon: ReceiptText },
  { id: "products", label: "商品別売上", icon: Boxes },
  { id: "menu", label: "メニュー管理", icon: Utensils },
  { id: "hours", label: "時間帯別売上", icon: BarChart3 },
  { id: "refunds", label: "返金履歴", icon: RotateCcw },
];

function formatYen(amount: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function SaleTable({
  sales,
  onCancel,
  showCancelledAt = false,
}: {
  sales: Sale[];
  onCancel?: (sale: Sale) => void;
  showCancelledAt?: boolean;
}) {
  if (sales.length === 0) {
    return (
      <div className="admin-empty">
        <PackageOpen size={30} />
        <strong>表示するデータがありません</strong>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="sales-table">
        <thead>
          <tr>
            <th>{showCancelledAt ? "取消日時" : "時刻"}</th>
            <th>取引 ID</th>
            <th>商品</th>
            <th className="number-cell">金額</th>
            <th>状態</th>
            {onCancel && <th aria-label="操作" />}
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td>
                {showCancelledAt && sale.cancelledAt
                  ? formatDateTime(sale.cancelledAt)
                  : formatTime(sale.createdAt)}
              </td>
              <td className="transaction-id">{sale.transactionId.slice(0, 8)}</td>
              <td>
                <div className="sale-items">
                  {sale.lines.map((line) => (
                    <span key={line.productId}>
                      {line.productName}
                      <small> × {line.quantity}</small>
                    </span>
                  ))}
                  {showCancelledAt && sale.cancelReason && (
                    <em>理由: {sale.cancelReason}</em>
                  )}
                </div>
              </td>
              <td className="number-cell">
                <strong>{formatYen(sale.totalAmount)}</strong>
              </td>
              <td>
                <span className={`status-badge ${sale.cancelled ? "cancelled" : ""}`}>
                  {sale.cancelled ? "取消済" : "売上"}
                </span>
              </td>
              {onCancel && (
                <td className="action-cell">
                  <button
                    className="table-action"
                    type="button"
                    disabled={sale.cancelled}
                    onClick={() => onCancel(sale)}
                  >
                    <RotateCcw size={15} />
                    取消
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cancellingSale, setCancellingSale] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [menuProducts, setMenuProducts] = useState<Product[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newShortName, setNewShortName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);

  const loadDashboard = useCallback(async (key: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/admin/dashboard", {
        headers: { "X-Admin-Key": key },
        cache: "no-store",
      });
      const body = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(body.error || "読み込めませんでした。");
      setData(body);
      setError("");
      return true;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "読み込めませんでした。",
      );
      return false;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const body = (await response.json()) as {
        products?: Product[];
        error?: string;
      };
      if (!response.ok || !body.products) {
        throw new Error(body.error || "メニューを読み込めませんでした。");
      }
      setMenuProducts(body.products);
    } catch (menuError) {
      setError(
        menuError instanceof Error
          ? menuError.message
          : "メニューを読み込めませんでした。",
      );
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("booth-admin-key");
    if (!stored) return;

    const frame = window.requestAnimationFrame(() => {
      setAdminKey(stored);
      setKeyDraft(stored);
      void loadDashboard(stored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadDashboard]);

  useEffect(() => {
    if (!adminKey) return;
    const timer = window.setInterval(() => {
      void loadDashboard(adminKey, true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [adminKey, loadDashboard]);

  // メニュー管理を開いたときにメニューを読み込む
  useEffect(() => {
    if (!adminKey || view !== "menu") return;
    const frame = window.requestAnimationFrame(() => void loadMenu());
    return () => window.cancelAnimationFrame(frame);
  }, [adminKey, view, loadMenu]);

  const filteredSales = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return data.sales;
    return data.sales.filter(
      (sale) =>
        sale.transactionId.toLowerCase().includes(needle) ||
        sale.lines.some((line) =>
          line.productName.toLowerCase().includes(needle),
        ),
    );
  }, [data, search]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const key = keyDraft.trim();
    if (!key) return;
    const success = await loadDashboard(key);
    if (success) {
      window.sessionStorage.setItem("booth-admin-key", key);
      setAdminKey(key);
    }
  }

  function logout() {
    window.sessionStorage.removeItem("booth-admin-key");
    setAdminKey("");
    setKeyDraft("");
    setData(null);
    setError("");
  }

  async function submitCancellation(event: React.FormEvent) {
    event.preventDefault();
    if (!cancellingSale) return;
    setSubmittingCancel(true);
    try {
      const response = await fetch(
        `/api/admin/sales/${cancellingSale.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Key": adminKey,
          },
          body: JSON.stringify({ reason: cancelReason }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "取消できませんでした。");
      setCancellingSale(null);
      setCancelReason("");
      await loadDashboard(adminKey, true);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "取消できませんでした。",
      );
    } finally {
      setSubmittingCancel(false);
    }
  }

  async function submitNewProduct(event: React.FormEvent) {
    event.preventDefault();
    setAddingProduct(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey,
        },
        body: JSON.stringify({
          name: newName,
          shortName: newShortName,
          category: newCategory,
          price: Number(newPrice),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "追加できませんでした。");
      setNewName("");
      setNewShortName("");
      setNewPrice("");
      setError("");
      await loadMenu();
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "追加できませんでした。",
      );
    } finally {
      setAddingProduct(false);
    }
  }

  async function removeProduct(product: Product) {
    if (
      !window.confirm(
        `「${product.name}」をメニューから外しますか?\n過去の売上データは残ります。`,
      )
    ) {
      return;
    }
    setDeletingProductId(product.id);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
        headers: { "X-Admin-Key": adminKey },
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "削除できませんでした。");
      setError("");
      await loadMenu();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "削除できませんでした。",
      );
    } finally {
      setDeletingProductId(null);
    }
  }

  if (!adminKey || !data) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-panel">
          <Link className="brand-lockup" href="/">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>
              <strong>LX-SYS</strong>
              <small>いわふぇす レジシステム</small>
            </span>
          </Link>
          <div className="login-copy">
            <span className="login-icon">
              <KeyRound size={24} />
            </span>
            <p className="eyebrow">管理者専用</p>
            <h1>管理画面にログイン</h1>
          </div>
          <form onSubmit={login}>
            <label className="field">
              <span>管理者キー</span>
              <input
                type="password"
                value={keyDraft}
                autoFocus
                autoComplete="off"
                placeholder="管理者キーを入力"
                onChange={(event) => setKeyDraft(event.target.value)}
              />
            </label>
            {error && (
              <p className="form-error">
                <AlertTriangle size={16} />
                {error}
              </p>
            )}
            <button
              className="primary-action"
              type="submit"
              disabled={!keyDraft.trim() || loading}
            >
              {loading ? <span className="spinner" /> : <Check size={18} />}
              {loading ? "確認中" : "ログイン"}
            </button>
          </form>
          <Link className="back-to-register" href="/">
            <Store size={16} />
            レジに戻る
          </Link>
        </section>
        <div className="login-context" aria-hidden="true">
          <div>
            <span>SALES CONTROL</span>
            <strong>売上の今を、<br />正確に。</strong>
          </div>
        </div>
      </main>
    );
  }

  const viewTitle = VIEWS.find((item) => item.id === view)?.label;
  const maxProductAmount = Math.max(
    1,
    ...data.productSales.map((item) => item.amount),
  );
  const activeHours = data.hourlySales.filter(
    (row) => row.hour >= 7 && row.hour <= 21,
  );
  const maxHourlyAmount = Math.max(1, ...activeHours.map((item) => item.amount));
  const menuCategories = [...new Set(menuProducts.map((item) => item.category))];
  const canAddProduct =
    newName.trim() !== "" &&
    newShortName.trim() !== "" &&
    newCategory.trim() !== "" &&
    newPrice !== "" &&
    Number(newPrice) >= 0;

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="admin-sidebar-top">
          <Link className="brand-lockup inverse" href="/">
            <span className="brand-mark" aria-hidden="true">
              L
            </span>
            <span>
              <strong>LX-SYS</strong>
              <small>いわふぇす レジシステム</small>
            </span>
          </Link>
          <button
            className="sidebar-close"
            type="button"
            onClick={() => setMenuOpen(false)}
            title="メニューを閉じる"
            aria-label="メニューを閉じる"
          >
            <X size={20} />
          </button>
        </div>
        <nav>
          <p>レポート</p>
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => {
                  setView(item.id);
                  setMenuOpen(false);
                }}
              >
                <Icon size={18} />
                {item.label}
                {item.id === "refunds" && data.cancellations.length > 0 && (
                  <span>{data.cancellations.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Link href="/">
            <Store size={17} />
            レジ画面
          </Link>
          <button type="button" onClick={logout}>
            <LogOut size={17} />
            ログアウト
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button
            className="mobile-menu-button"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="メニューを開く"
            title="メニューを開く"
          >
            <Menu size={21} />
          </button>
          <div>
            <p className="eyebrow">SALES REPORT</p>
            <h1>{viewTitle}</h1>
          </div>
          <div className="topbar-actions">
            <span className="report-date">
              <CalendarDays size={17} />
              {data.businessDate.replaceAll("-", "/")}
            </span>
            <button
              className="icon-button"
              type="button"
              title="最新情報に更新"
              aria-label="最新情報に更新"
              onClick={() => void loadDashboard(adminKey)}
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? "spinning" : ""} />
            </button>
          </div>
        </header>

        {error && (
          <div className="admin-alert" role="alert">
            <AlertTriangle size={17} />
            {error}
            <button type="button" onClick={() => setError("")} aria-label="閉じる">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="admin-content">
          {(view === "overview" || view === "sales") && (
            <section className="metrics-grid" aria-label="本日の売上指標">
              <div className="metric-block primary-metric">
                <span className="metric-icon">
                  <WalletCards size={19} />
                </span>
                <p>本日の純売上</p>
                <strong>{formatYen(data.summary.netSales)}</strong>
                <small>取消分を除く</small>
              </div>
              <div className="metric-block">
                <span className="metric-icon teal">
                  <ReceiptText size={19} />
                </span>
                <p>取引件数</p>
                <strong>{data.summary.transactionCount}<i>件</i></strong>
                <small>平均 {formatYen(data.summary.averageSpend)}</small>
              </div>
              <div className="metric-block">
                <span className="metric-icon yellow">
                  <TrendingUp size={19} />
                </span>
                <p>販売点数</p>
                <strong>
                  {data.productSales.reduce((sum, item) => sum + item.quantity, 0)}
                  <i>点</i>
                </strong>
                <small>{data.productSales.length} 商品</small>
              </div>
              <div className="metric-block">
                <span className="metric-icon red">
                  <RotateCcw size={19} />
                </span>
                <p>取消金額</p>
                <strong>{formatYen(data.summary.cancelledAmount)}</strong>
                <small>{data.summary.cancelledCount} 件</small>
              </div>
            </section>
          )}

          {view === "overview" && (
            <>
              <div className="overview-grid">
                <section className="admin-section">
                  <div className="admin-section-heading">
                    <div>
                      <p className="eyebrow">HOURLY SALES</p>
                      <h2>時間帯別の売上</h2>
                    </div>
                    <button type="button" onClick={() => setView("hours")}>
                      詳細を見る
                    </button>
                  </div>
                  <div className="mini-hour-chart">
                    {activeHours.map((row) => (
                      <div className="mini-bar-column" key={row.hour}>
                        <div
                          className="mini-bar"
                          style={{
                            height: `${Math.max(
                              row.amount > 0 ? 8 : 2,
                              (row.amount / maxHourlyAmount) * 100,
                            )}%`,
                          }}
                          title={`${row.hour}時: ${formatYen(row.amount)}`}
                        />
                        <span>{row.hour}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-section">
                  <div className="admin-section-heading">
                    <div>
                      <p className="eyebrow">TOP PRODUCTS</p>
                      <h2>商品別の構成</h2>
                    </div>
                    <button type="button" onClick={() => setView("products")}>
                      詳細を見る
                    </button>
                  </div>
                  <div className="product-ranking compact">
                    {data.productSales.slice(0, 5).map((item, index) => (
                      <div className="ranking-row" key={item.productId}>
                        <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <span>
                            <strong>{item.productName}</strong>
                            <small>{item.quantity}点</small>
                          </span>
                          <div className="progress-track">
                            <i
                              style={{
                                width: `${(item.amount / maxProductAmount) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <strong>{formatYen(item.amount)}</strong>
                      </div>
                    ))}
                    {data.productSales.length === 0 && (
                      <div className="admin-empty compact">
                        <PackageOpen size={24} />
                        <strong>まだ売上がありません</strong>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <section className="admin-section">
                <div className="admin-section-heading">
                  <div>
                    <p className="eyebrow">LATEST TRANSACTIONS</p>
                    <h2>直近の売上</h2>
                  </div>
                  <button type="button" onClick={() => setView("sales")}>
                    すべて表示
                  </button>
                </div>
                <SaleTable
                  sales={data.sales.slice(0, 6)}
                  onCancel={setCancellingSale}
                />
              </section>
            </>
          )}

          {view === "sales" && (
            <section className="admin-section">
              <div className="admin-section-heading sales-list-heading">
                <div>
                  <p className="eyebrow">TODAY&apos;S TRANSACTIONS</p>
                  <h2>売上一覧</h2>
                </div>
                <label className="search-field">
                  <Search size={17} />
                  <input
                    type="search"
                    value={search}
                    placeholder="取引ID・商品名で検索"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              <SaleTable sales={filteredSales} onCancel={setCancellingSale} />
            </section>
          )}

          {view === "products" && (
            <section className="admin-section report-section">
              <div className="admin-section-heading">
                <div>
                  <p className="eyebrow">SALES BY PRODUCT</p>
                  <h2>商品別売上</h2>
                </div>
                <span className="section-meta">
                  <ListFilter size={16} />
                  売上金額順
                </span>
              </div>
              <div className="product-ranking">
                {data.productSales.map((item, index) => (
                  <div className="ranking-row large" key={item.productId}>
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <span>
                        <strong>{item.productName}</strong>
                        <small>{item.quantity}点</small>
                      </span>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${(item.amount / maxProductAmount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <strong>{formatYen(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === "menu" && (
            <>
              <section className="admin-section">
                <div className="admin-section-heading">
                  <div>
                    <p className="eyebrow">ADD ITEM</p>
                    <h2>メニューを追加</h2>
                  </div>
                </div>
                <form onSubmit={submitNewProduct}>
                  <label className="field">
                    <span>商品名</span>
                    <input
                      value={newName}
                      maxLength={50}
                      placeholder="例: アイスティー"
                      onChange={(event) => setNewName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>略称(レジのボタンに表示・10文字まで)</span>
                    <input
                      value={newShortName}
                      maxLength={10}
                      placeholder="例: アイス"
                      onChange={(event) => setNewShortName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>カテゴリー</span>
                    <input
                      value={newCategory}
                      maxLength={30}
                      list="menu-categories"
                      placeholder="例: ドリンク"
                      onChange={(event) => setNewCategory(event.target.value)}
                    />
                    <datalist id="menu-categories">
                      {menuCategories.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </label>
                  <label className="field">
                    <span>価格(円)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={newPrice}
                      placeholder="例: 450"
                      onChange={(event) => setNewPrice(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary-action"
                    type="submit"
                    disabled={!canAddProduct || addingProduct}
                  >
                    {addingProduct ? <span className="spinner" /> : <Plus size={18} />}
                    {addingProduct ? "追加中" : "メニューに追加"}
                  </button>
                </form>
              </section>

              <section className="admin-section">
                <div className="admin-section-heading">
                  <div>
                    <p className="eyebrow">CURRENT MENU</p>
                    <h2>現在のメニュー</h2>
                  </div>
                  <span className="section-meta">{menuProducts.length} 品</span>
                </div>
                {menuLoading && menuProducts.length === 0 ? (
                  <div className="admin-empty">
                    <span className="spinner" />
                  </div>
                ) : menuProducts.length === 0 ? (
                  <div className="admin-empty">
                    <PackageOpen size={30} />
                    <strong>メニューがありません</strong>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="sales-table">
                      <thead>
                        <tr>
                          <th>商品名</th>
                          <th>略称</th>
                          <th>カテゴリー</th>
                          <th className="number-cell">価格</th>
                          <th aria-label="操作" />
                        </tr>
                      </thead>
                      <tbody>
                        {menuProducts.map((product) => (
                          <tr key={product.id}>
                            <td>{product.name}</td>
                            <td>{product.shortName}</td>
                            <td>{product.category}</td>
                            <td className="number-cell">
                              <strong>{formatYen(product.price)}</strong>
                            </td>
                            <td className="action-cell">
                              <button
                                className="table-action"
                                type="button"
                                disabled={deletingProductId === product.id}
                                onClick={() => void removeProduct(product)}
                              >
                                <Trash2 size={15} />
                                削除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {view === "hours" && (
            <section className="admin-section report-section">
              <div className="admin-section-heading">
                <div>
                  <p className="eyebrow">SALES BY HOUR</p>
                  <h2>時間帯別売上</h2>
                </div>
                <span className="section-meta">
                  <Clock3 size={16} />
                  7:00–21:59
                </span>
              </div>
              <div className="hour-chart">
                {activeHours.map((row) => (
                  <div className="hour-column" key={row.hour}>
                    <div className="hour-value">
                      {row.amount > 0 && formatYen(row.amount)}
                    </div>
                    <div className="hour-bar-space">
                      <div
                        className="hour-bar"
                        style={{
                          height: `${Math.max(
                            row.amount > 0 ? 4 : 0,
                            (row.amount / maxHourlyAmount) * 100,
                          )}%`,
                        }}
                      >
                        {row.transactions > 0 && <span>{row.transactions}件</span>}
                      </div>
                    </div>
                    <strong>{row.hour}:00</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view === "refunds" && (
            <section className="admin-section">
              <div className="admin-section-heading">
                <div>
                  <p className="eyebrow">CANCELLATION LOG</p>
                  <h2>返金・取消履歴</h2>
                </div>
                <span className="section-meta">
                  最新 {data.cancellations.length} 件
                </span>
              </div>
              <SaleTable sales={data.cancellations} showCancelledAt />
            </section>
          )}
        </div>
      </main>

      {menuOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="メニューを閉じる"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {cancellingSale && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal cancellation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            onSubmit={submitCancellation}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow danger">REFUND / CANCEL</p>
                <h2 id="cancel-title">売上を取り消す</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCancellingSale(null)}
                aria-label="閉じる"
                title="閉じる"
              >
                <X size={20} />
              </button>
            </div>
            <div className="cancel-target">
              <span>{formatTime(cancellingSale.createdAt)} の売上</span>
              <strong>{formatYen(cancellingSale.totalAmount)}</strong>
              <small>
                {cancellingSale.lines
                  .map((line) => `${line.productName} × ${line.quantity}`)
                  .join("、")}
              </small>
            </div>
            <div className="warning-note">
              <AlertTriangle size={18} />
              <p>
                売上データは削除されません。取消済みとして返金履歴に保存されます。
              </p>
            </div>
            <label className="field">
              <span>取消理由</span>
              <textarea
                value={cancelReason}
                rows={3}
                autoFocus
                maxLength={200}
                placeholder="例: 商品の渡し間違い"
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </label>
            <button
              className="danger-action"
              type="submit"
              disabled={cancelReason.trim().length < 2 || submittingCancel}
            >
              {submittingCancel ? <span className="spinner" /> : <RotateCcw size={18} />}
              {submittingCancel ? "処理中" : "返金・取消を確定"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}