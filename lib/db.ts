import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  DashboardData,
  HourlySalesRow,
  Product,
  ProductSalesRow,
  Sale,
  SaleLine,
} from "@/lib/types";
import { getTokyoBusinessParts } from "@/lib/time";

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: "drip-coffee",
    name: "ドリップコーヒー",
    shortName: "コーヒー",
    category: "ドリンク",
    price: 500,
    accent: "#D95D39",
    sortOrder: 10,
  },
  {
    id: "cafe-latte",
    name: "カフェラテ",
    shortName: "ラテ",
    category: "ドリンク",
    price: 600,
    accent: "#2D7D74",
    sortOrder: 20,
  },
  {
    id: "lemon-soda",
    name: "レモンソーダ",
    shortName: "ソーダ",
    category: "ドリンク",
    price: 550,
    accent: "#C99A16",
    sortOrder: 30,
  },
  {
    id: "ham-sandwich",
    name: "ハムサンド",
    shortName: "サンド",
    category: "フード",
    price: 700,
    accent: "#A8553A",
    sortOrder: 40,
  },
  {
    id: "cheese-toast",
    name: "チーズトースト",
    shortName: "トースト",
    category: "フード",
    price: 650,
    accent: "#3F6F8F",
    sortOrder: 50,
  },
  {
    id: "baked-cheesecake",
    name: "ベイクドチーズケーキ",
    shortName: "ケーキ",
    category: "スイーツ",
    price: 600,
    accent: "#8E5F99",
    sortOrder: 60,
  },
];

type SaleRow = {
  id: string;
  transaction_id: string;
  total_amount: number;
  cancelled: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

type SaleLineRow = {
  sale_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};

type ProductRow = {
  id: string;
  name: string;
  short_name: string;
  category: string;
  price: number;
  accent: string;
  sort_order: number;
};

const globalForDatabase = globalThis as typeof globalThis & {
  boothDatabase?: Database.Database;
};

function openDatabase() {
  const databasePath = process.env.SQLITE_PATH
    ? resolve(/* turbopackIgnore: true */ process.env.SQLITE_PATH)
    : resolve(process.cwd(), "data", "booth-sales.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      accent TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL UNIQUE,
      total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
      cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
      cancelled_at TEXT,
      cancelled_business_date TEXT,
      cancel_reason TEXT,
      cancelled_by TEXT,
      created_at TEXT NOT NULL,
      business_date TEXT NOT NULL,
      business_hour INTEGER NOT NULL CHECK (business_hour BETWEEN 0 AND 23)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id TEXT NOT NULL REFERENCES sales(id),
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      line_total INTEGER NOT NULL CHECK (line_total >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_business_date
      ON sales(business_date, cancelled, created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_cancelled_at
      ON sales(cancelled, cancelled_at);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
      ON sale_items(sale_id);
  `);

  const seed = database.prepare(`
    INSERT OR IGNORE INTO products
      (id, name, short_name, category, price, accent, sort_order)
    VALUES
      (@id, @name, @shortName, @category, @price, @accent, @sortOrder)
  `);
  const seedProducts = database.transaction(() => {
    for (const product of DEFAULT_PRODUCTS) seed.run(product);
  });
  seedProducts();

  return database;
}

export function getDatabase() {
  if (!globalForDatabase.boothDatabase) {
    globalForDatabase.boothDatabase = openDatabase();
  }
  return globalForDatabase.boothDatabase;
}

export function listProducts(): Product[] {
  const rows = getDatabase()
    .prepare(
      `SELECT id, name, short_name, category, price, accent, sort_order
       FROM products
       WHERE active = 1
       ORDER BY sort_order, name`,
    )
    .all() as ProductRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    category: row.category,
    price: row.price,
    accent: row.accent,
    sortOrder: row.sort_order,
  }));
}

function mapLines(rows: SaleLineRow[]) {
  const linesBySale = new Map<string, SaleLine[]>();

  for (const row of rows) {
    const lines = linesBySale.get(row.sale_id) ?? [];
    lines.push({
      productId: row.product_id,
      productName: row.product_name,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      lineTotal: row.line_total,
    });
    linesBySale.set(row.sale_id, lines);
  }

  return linesBySale;
}

function mapSales(rows: SaleRow[], linesBySale: Map<string, SaleLine[]>): Sale[] {
  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    totalAmount: row.total_amount,
    cancelled: Boolean(row.cancelled),
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    lines: linesBySale.get(row.id) ?? [],
  }));
}

export function createSale(input: {
  transactionId: string;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const database = getDatabase();
  const existing = database
    .prepare(
      `SELECT id, transaction_id, total_amount, cancelled, cancelled_at,
              cancel_reason, created_at
       FROM sales WHERE transaction_id = ?`,
    )
    .get(input.transactionId) as SaleRow | undefined;

  if (existing) {
    return { sale: mapSales([existing], new Map())[0], duplicated: true };
  }

  const productStatement = database.prepare(
    `SELECT id, name, short_name, category, price, accent, sort_order
     FROM products WHERE id = ? AND active = 1`,
  );
  const products = input.items.map((item) => {
    const product = productStatement.get(item.productId) as ProductRow | undefined;
    if (!product) throw new Error(`商品 ${item.productId} は販売できません。`);
    return { item, product };
  });
  const totalAmount = products.reduce(
    (sum, { item, product }) => sum + item.quantity * product.price,
    0,
  );
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const { businessDate, businessHour } = getTokyoBusinessParts();

  const insert = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO sales
          (id, transaction_id, total_amount, created_at, business_date, business_hour)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.transactionId,
        totalAmount,
        createdAt,
        businessDate,
        businessHour,
      );

    const insertItem = database.prepare(
      `INSERT INTO sale_items
        (sale_id, product_id, product_name, unit_price, quantity, line_total)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const { item, product } of products) {
      insertItem.run(
        id,
        product.id,
        product.name,
        product.price,
        item.quantity,
        product.price * item.quantity,
      );
    }
  });
  insert();

  const lines: SaleLine[] = products.map(({ item, product }) => ({
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity: item.quantity,
    lineTotal: product.price * item.quantity,
  }));

  return {
    duplicated: false,
    sale: {
      id,
      transactionId: input.transactionId,
      totalAmount,
      cancelled: false,
      cancelledAt: null,
      cancelReason: null,
      createdAt,
      lines,
    } satisfies Sale,
  };
}

export function cancelSale(saleId: string, reason: string) {
  const database = getDatabase();
  const cancelledAt = new Date().toISOString();
  const { businessDate } = getTokyoBusinessParts();
  const result = database
    .prepare(
      `UPDATE sales
       SET cancelled = 1,
           cancelled_at = ?,
           cancelled_business_date = ?,
           cancel_reason = ?,
           cancelled_by = 'administrator'
       WHERE id = ? AND cancelled = 0`,
    )
    .run(cancelledAt, businessDate, reason, saleId);

  if (result.changes === 1) return { status: "cancelled" as const };

  const sale = database
    .prepare("SELECT cancelled FROM sales WHERE id = ?")
    .get(saleId) as { cancelled: number } | undefined;
  return sale
    ? { status: "already_cancelled" as const }
    : { status: "not_found" as const };
}

export function getDashboard(): DashboardData {
  const database = getDatabase();
  const { businessDate } = getTokyoBusinessParts();
  const salesRows = database
    .prepare(
      `SELECT id, transaction_id, total_amount, cancelled, cancelled_at,
              cancel_reason, created_at
       FROM sales
       WHERE business_date = ?
       ORDER BY created_at DESC`,
    )
    .all(businessDate) as SaleRow[];

  const cancellationRows = database
    .prepare(
      `SELECT id, transaction_id, total_amount, cancelled, cancelled_at,
              cancel_reason, created_at
       FROM sales
       WHERE cancelled = 1
       ORDER BY cancelled_at DESC
       LIMIT 50`,
    )
    .all() as SaleRow[];
  const allSaleIds = [...salesRows, ...cancellationRows].map((row) => row.id);
  const lineRows =
    allSaleIds.length > 0
      ? (database
          .prepare(
            `SELECT sale_id, product_id, product_name, unit_price, quantity, line_total
             FROM sale_items
             WHERE sale_id IN (${allSaleIds.map(() => "?").join(",")})
             ORDER BY id`,
          )
          .all(...allSaleIds) as SaleLineRow[])
      : [];
  const linesBySale = mapLines(lineRows);

  const summary = database
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN cancelled = 0 THEN total_amount ELSE 0 END), 0) AS netSales,
         SUM(CASE WHEN cancelled = 0 THEN 1 ELSE 0 END) AS transactionCount,
         COALESCE(SUM(CASE WHEN cancelled = 1 THEN total_amount ELSE 0 END), 0) AS cancelledAmount,
         SUM(CASE WHEN cancelled = 1 THEN 1 ELSE 0 END) AS cancelledCount
       FROM sales
       WHERE business_date = ?`,
    )
    .get(businessDate) as {
    netSales: number;
    transactionCount: number;
    cancelledAmount: number;
    cancelledCount: number;
  };
  const productSales = database
    .prepare(
      `SELECT
         sale_items.product_id AS productId,
         sale_items.product_name AS productName,
         SUM(sale_items.quantity) AS quantity,
         SUM(sale_items.line_total) AS amount
       FROM sale_items
       JOIN sales ON sales.id = sale_items.sale_id
       WHERE sales.business_date = ? AND sales.cancelled = 0
       GROUP BY sale_items.product_id, sale_items.product_name
       ORDER BY amount DESC`,
    )
    .all(businessDate) as ProductSalesRow[];
  const hourlyRows = database
    .prepare(
      `SELECT
         business_hour AS hour,
         SUM(total_amount) AS amount,
         COUNT(*) AS transactions
       FROM sales
       WHERE business_date = ? AND cancelled = 0
       GROUP BY business_hour
       ORDER BY business_hour`,
    )
    .all(businessDate) as HourlySalesRow[];
  const hourlyMap = new Map(hourlyRows.map((row) => [row.hour, row]));
  const hourlySales = Array.from({ length: 24 }, (_, hour) =>
    hourlyMap.get(hour) ?? { hour, amount: 0, transactions: 0 },
  );

  return {
    businessDate,
    generatedAt: new Date().toISOString(),
    summary: {
      ...summary,
      averageSpend:
        summary.transactionCount > 0
          ? Math.round(summary.netSales / summary.transactionCount)
          : 0,
    },
    sales: mapSales(salesRows, linesBySale),
    productSales,
    hourlySales,
    cancellations: mapSales(cancellationRows, linesBySale),
  };
}
const ACCENT_COLORS = [
  "#D95D39",
  "#2D7D74",
  "#C99A16",
  "#A8553A",
  "#3F6F8F",
  "#8E5F99",
];

export function addProduct(input: {
  name: string;
  shortName: string;
  category: string;
  price: number;
}): Product {
  const database = getDatabase();
  const id = randomUUID();
  const { maxOrder, count } = database
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) AS maxOrder, COUNT(*) AS count FROM products",
    )
    .get() as { maxOrder: number; count: number };
  const sortOrder = maxOrder + 10;
  const accent = ACCENT_COLORS[count % ACCENT_COLORS.length];

  database
    .prepare(
      `INSERT INTO products
        (id, name, short_name, category, price, accent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.shortName,
      input.category,
      input.price,
      accent,
      sortOrder,
    );

  return {
    id,
    name: input.name,
    shortName: input.shortName,
    category: input.category,
    price: input.price,
    accent,
    sortOrder,
  };
}

// 行は消さず、メニューから外す(過去の売上データを守るため)
export function deactivateProduct(id: string) {
  const result = getDatabase()
    .prepare("UPDATE products SET active = 0 WHERE id = ? AND active = 1")
    .run(id);
  return result.changes === 1;
}

