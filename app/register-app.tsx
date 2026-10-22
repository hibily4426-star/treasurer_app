"use client";

import {
  Check,
  ChevronRight,
  CircleHelp,
  Coffee,
  CupSoda,
  Minus,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings,
  ShoppingBasket,
  Store,
  Trash2,
  Utensils,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";

type Cart = Record<string, number>;
type RegisterConfig = { serverUrl: string; apiKey: string };
type Notice = { kind: "success" | "error"; message: string } | null;

const DEFAULT_CONFIG: RegisterConfig = { serverUrl: "", apiKey: "" };

function formatYen(amount: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

function categoryIcon(category: string) {
  if (category === "ドリンク") return CupSoda;
  if (category === "フード") return Utensils;
  if (category === "スイーツ") return Coffee;
  return ShoppingBasket;
}

export function RegisterApp({
  products: initialProducts,
}: {
  products: Product[];
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [category, setCategory] = useState("すべて");
  const [cart, setCart] = useState<Cart>({});
  const [config, setConfig] = useState<RegisterConfig>(DEFAULT_CONFIG);
  const [draftConfig, setDraftConfig] =
    useState<RegisterConfig>(DEFAULT_CONFIG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [lastReceipt, setLastReceipt] = useState<{
    id: string;
    total: number;
  } | null>(null);

  const categories = [
    "すべて",
    ...new Set(products.map((item) => item.category)),
  ];
  // 選んでいたカテゴリーの商品が全部なくなったら「すべて」に戻す
  const activeCategory = categories.includes(category) ? category : "すべて";

  // メニューをサーバーから取り直す。取得できたら商品一覧を返し、失敗なら null
  const refreshProducts = useCallback(async (): Promise<Product[] | null> => {
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      if (!response.ok) return null;
      const body = (await response.json()) as { products: Product[] };
      setProducts(body.products);
      // 販売終了した商品は注文からも外す
      const ids = new Set(body.products.map((item) => item.id));
      setCart((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => ids.has(id)),
        ),
      );
      return body.products;
    } catch {
      // 通信できないときは今のメニューのまま使う
      return null;
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("booth-register-config");
    const initial = stored
      ? (JSON.parse(stored) as RegisterConfig)
      : { serverUrl: window.location.origin, apiKey: "" };
    setConfig(initial);
    setDraftConfig(initial);
    setOnline(window.navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 30秒ごと、および画面に戻ってきたときにメニューを取り直す
  useEffect(() => {
    const timer = window.setInterval(() => void refreshProducts(), 30000);
    const handleVisible = () => {
      if (document.visibilityState === "visible") void refreshProducts();
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [refreshProducts]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleProducts =
    activeCategory === "すべて"
      ? products
      : products.filter((product) => product.category === activeCategory);
  const cartLines = useMemo(
    () =>
      products
        .filter((product) => cart[product.id])
        .map((product) => ({ product, quantity: cart[product.id] })),
    [cart, products],
  );
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );

  function changeQuantity(productId: string, amount: number) {
    setCart((current) => {
      const next = Math.max(0, (current[productId] ?? 0) + amount);
      if (next === 0) {
        const { [productId]: _, ...rest } = current;
        void _;
        return rest;
      }
      return { ...current, [productId]: next };
    });
  }

  function saveSettings() {
    const next = {
      serverUrl: draftConfig.serverUrl.trim().replace(/\/+$/, ""),
      apiKey: draftConfig.apiKey.trim(),
    };
    window.localStorage.setItem("booth-register-config", JSON.stringify(next));
    setConfig(next);
    setSettingsOpen(false);
    setNotice({ kind: "success", message: "端末設定を保存しました。" });
  }

  async function beginCheckout() {
    if (!config.apiKey || !config.serverUrl) {
      setDraftConfig({
        serverUrl: config.serverUrl || window.location.origin,
        apiKey: config.apiKey,
      });
      setSettingsOpen(true);
      setNotice({ kind: "error", message: "先に接続設定を完了してください。" });
      return;
    }

    // 会計の前にメニューを取り直し、販売終了した商品が注文に残っていないか確認する
    const latest = await refreshProducts();
    if (latest) {
      const ids = new Set(latest.map((item) => item.id));
      const removed = Object.keys(cart).some((id) => !ids.has(id));
      if (removed) {
        setNotice({
          kind: "error",
          message: "販売終了した商品を注文から外しました。内容を確認してください。",
        });
        return;
      }
    }
    setCheckoutOpen(true);
  }

  async function submitSale() {
    setSending(true);
    const transactionId = crypto.randomUUID();
    try {
      const response = await fetch(`${config.serverUrl}/api/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey,
        },
        body: JSON.stringify({
          transactionId,
          items: cartLines.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
          })),
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        sale?: { id: string; totalAmount: number };
      };
      if (!response.ok || !body.sale) {
        throw new Error(body.error || "サーバーに送信できませんでした。");
      }

      setLastReceipt({ id: body.sale.id, total: body.sale.totalAmount });
      setCart({});
      setCheckoutOpen(false);
      setNotice({ kind: "success", message: "会計を記録しました。" });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "送信に失敗しました。",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="register-shell">
      <header className="register-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>
            <strong>LX-SYS</strong>
            <small>いわふぇす　レジシステム</small>
          </span>
        </div>
        <div className="register-header-actions">
          <span className={`connection-state ${online ? "is-online" : ""}`}>
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}
            {online ? "オンライン" : "オフライン"}
          </span>
          <Link
            className="icon-button"
            href="/admin"
            title="管理画面"
            aria-label="管理画面"
          >
            <Store size={20} />
          </Link>
          <button
            className="icon-button"
            type="button"
            title="端末設定"
            aria-label="端末設定"
            onClick={() => {
              setDraftConfig(config);
              setSettingsOpen(true);
            }}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="register-main">
        <section className="catalog-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">商品を選択</p>
              <h1>新しい会計</h1>
            </div>
            <time>
              {new Intl.DateTimeFormat("ja-JP", {
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date())}
            </time>
          </div>

          <div className="category-tabs" role="tablist" aria-label="商品カテゴリー">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={activeCategory === item}
                className={activeCategory === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => {
              const Icon = categoryIcon(product.category);
              const quantity = cart[product.id] ?? 0;
              return (
                <button
                  className="product-button"
                  type="button"
                  key={product.id}
                  onClick={() => changeQuantity(product.id, 1)}
                  style={{ "--product-accent": product.accent } as React.CSSProperties}
                >
                  <span className="product-icon">
                    <Icon size={25} strokeWidth={1.8} />
                  </span>
                  {quantity > 0 && (
                    <span className="product-quantity">{quantity}</span>
                  )}
                  <span className="product-category">{product.category}</span>
                  <strong>{product.shortName}</strong>
                  <span className="product-price">{formatYen(product.price)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="order-panel">
          <div className="order-heading">
            <span className="order-title">
              <ReceiptText size={20} />
              注文内容
            </span>
            <span className="item-count">{itemCount}点</span>
          </div>

          <div className={`order-lines ${cartLines.length === 0 ? "empty" : ""}`}>
            {cartLines.length === 0 ? (
              <div className="empty-order">
                <span>
                  <ShoppingBasket size={28} />
                </span>
                <strong>商品を選択してください</strong>
                <p>左の商品ボタンを押すと追加されます</p>
              </div>
            ) : (
              cartLines.map(({ product, quantity }) => (
                <div className="order-line" key={product.id}>
                  <div className="line-copy">
                    <strong>{product.name}</strong>
                    <span>{formatYen(product.price)} / 点</span>
                  </div>
                  <div className="quantity-stepper">
                    <button
                      type="button"
                      aria-label={`${product.name}を1点減らす`}
                      title="1点減らす"
                      onClick={() => changeQuantity(product.id, -1)}
                    >
                      <Minus size={16} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      type="button"
                      aria-label={`${product.name}を1点増やす`}
                      title="1点増やす"
                      onClick={() => changeQuantity(product.id, 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <strong className="line-total">
                    {formatYen(product.price * quantity)}
                  </strong>
                  <button
                    className="line-delete"
                    type="button"
                    title="商品を削除"
                    aria-label={`${product.name}を削除`}
                    onClick={() =>
                      setCart((current) => {
                        const { [product.id]: _, ...rest } = current;
                        void _;
                        return rest;
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="order-footer">
            <div className="total-row">
              <span>合計</span>
              <strong>{formatYen(total)}</strong>
            </div>
            <button
              className="primary-action"
              type="button"
              disabled={cartLines.length === 0}
              onClick={beginCheckout}
            >
              会計へ進む
              <ChevronRight size={21} />
            </button>
            <button
              className="clear-action"
              type="button"
              disabled={cartLines.length === 0}
              onClick={() => setCart({})}
            >
              <RotateCcw size={15} />
              注文をクリア
            </button>
          </div>
        </aside>
      </main>

      {notice && (
        <div className={`toast ${notice.kind}`} role="status">
          {notice.kind === "success" ? <Check size={18} /> : <CircleHelp size={18} />}
          {notice.message}
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal compact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">この端末</p>
                <h2 id="settings-title">接続設定</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="閉じる"
                title="閉じる"
              >
                <X size={20} />
              </button>
            </div>
            <label className="field">
              <span>ブースサーバー URL</span>
              <input
                type="url"
                value={draftConfig.serverUrl}
                placeholder="https://booth.example.com"
                onChange={(event) =>
                  setDraftConfig((current) => ({
                    ...current,
                    serverUrl: event.target.value,
                  }))
                }
              />
            </label>
            <label className="field">
              <span>レジ API キー</span>
              <input
                type="password"
                value={draftConfig.apiKey}
                autoComplete="off"
                placeholder="API キーを入力"
                onChange={(event) =>
                  setDraftConfig((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
              />
            </label>
            <p className="field-note">
              設定はこの Windows 端末のブラウザー内に保存されます。
            </p>
            <button
              className="primary-action"
              type="button"
              disabled={!draftConfig.serverUrl.trim() || !draftConfig.apiKey.trim()}
              onClick={saveSettings}
            >
              <Check size={18} />
              設定を保存
            </button>
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">会計確認</p>
                <h2 id="payment-title">お支払い金額</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setCheckoutOpen(false)}
                aria-label="閉じる"
                title="閉じる"
                disabled={sending}
              >
                <X size={20} />
              </button>
            </div>
            <strong className="payment-total">{formatYen(total)}</strong>
            <div className="payment-summary">
              <span>商品数</span>
              <strong>{itemCount}点</strong>
            </div>
            <button
              className="primary-action confirm-payment"
              type="button"
              onClick={submitSale}
              disabled={sending}
            >
              {sending ? (
                <span className="spinner" aria-label="送信中" />
              ) : (
                <Check size={21} />
              )}
              {sending ? "サーバーへ送信中" : "会計を確定する"}
            </button>
          </section>
        </div>
      )}

      {lastReceipt && (
        <button
          className="last-receipt"
          type="button"
          onClick={() => setLastReceipt(null)}
          title="閉じる"
        >
          <Check size={17} />
          <span>
            直前の会計 <strong>{formatYen(lastReceipt.total)}</strong>
          </span>
          <X size={15} />
        </button>
      )}
    </div>
  );
}