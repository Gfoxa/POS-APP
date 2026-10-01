export type SeedCategory = {
  name: string;
  slug: string;
  description: string;
};

export type SeedIngredient = {
  name: string;
  unit: "GRAM" | "MILLILITER" | "PIECE";
  openingStock: string;
  minimumStock: string;
  costPerUnit: string;
};

export type SeedRecipeItem = {
  ingredientName: string;
  quantity: string;
};

export type SeedProduct = {
  name: string;
  sku: string;
  description: string;
  categorySlug: string;
  price: string;
  variants?: { name: string; sku: string; price: string }[];
  addonNames?: string[];
  recipe: SeedRecipeItem[];
};

export type SeedAddon = { name: string; price: string };

const CATEGORIES: SeedCategory[] = [
  { name: "Coffee", slug: "coffee", description: "Minuman berbasis kopi" },
  {
    name: "Non Coffee",
    slug: "non-coffee",
    description: "Minuman tanpa kopi",
  },
  { name: "Tea", slug: "tea", description: "Teh dan racikannya" },
  { name: "Food", slug: "food", description: "Makanan utama dan camilan" },
  { name: "Dessert", slug: "dessert", description: "Kue dan hidangan penutup" },
];

const INGREDIENTS: SeedIngredient[] = [
  { name: "Coffee Beans", unit: "GRAM", openingStock: "5000", minimumStock: "500", costPerUnit: "120" },
  { name: "Fresh Milk", unit: "MILLILITER", openingStock: "12000", minimumStock: "2000", costPerUnit: "30" },
  { name: "Vanilla Syrup", unit: "MILLILITER", openingStock: "3000", minimumStock: "500", costPerUnit: "45" },
  { name: "Ice", unit: "GRAM", openingStock: "15000", minimumStock: "3000", costPerUnit: "2" },
  { name: "Matcha Powder", unit: "GRAM", openingStock: "1500", minimumStock: "250", costPerUnit: "350" },
  { name: "Chocolate Powder", unit: "GRAM", openingStock: "2000", minimumStock: "300", costPerUnit: "95" },
  { name: "Croissant", unit: "PIECE", openingStock: "48", minimumStock: "8", costPerUnit: "9000" },
  { name: "Potatoes", unit: "GRAM", openingStock: "6000", minimumStock: "1000", costPerUnit: "18" },
  { name: "Cheesecake", unit: "PIECE", openingStock: "24", minimumStock: "4", costPerUnit: "14000" },
  { name: "Black Tea", unit: "GRAM", openingStock: "1200", minimumStock: "200", costPerUnit: "80" },
];

const ADDONS: SeedAddon[] = [
  { name: "Extra Shot", price: "7000" },
  { name: "Oat Milk", price: "8000" },
  { name: "Vanilla", price: "5000" },
];

const PRODUCTS: SeedProduct[] = [
  { name: "Espresso", sku: "COF-ESP-001", description: "Espresso dengan crema tebal", categorySlug: "coffee", price: "18000", recipe: [{ ingredientName: "Coffee Beans", quantity: "18" }] },
  { name: "Americano", sku: "COF-AMR-001", description: "Espresso dengan air panas", categorySlug: "coffee", price: "22000", recipe: [{ ingredientName: "Coffee Beans", quantity: "18" }] },
  { name: "Cafe Latte", sku: "COF-LAT-001", description: "Espresso dan susu segar", categorySlug: "coffee", price: "28000", addonNames: ["Extra Shot", "Oat Milk", "Vanilla"], recipe: [{ ingredientName: "Coffee Beans", quantity: "18" }, { ingredientName: "Fresh Milk", quantity: "200" }] },
  { name: "Cappuccino", sku: "COF-CAP-001", description: "Espresso dengan susu dan foam", categorySlug: "coffee", price: "28000", addonNames: ["Extra Shot", "Oat Milk"], recipe: [{ ingredientName: "Coffee Beans", quantity: "18" }, { ingredientName: "Fresh Milk", quantity: "150" }] },
  { name: "Mocha", sku: "COF-MOC-001", description: "Espresso, susu, dan cokelat", categorySlug: "coffee", price: "32000", recipe: [{ ingredientName: "Coffee Beans", quantity: "18" }, { ingredientName: "Fresh Milk", quantity: "180" }, { ingredientName: "Chocolate Powder", quantity: "20" }] },
  { name: "Iced Latte", sku: "COF-ICE-LAT-001", description: "Cafe latte dingin dengan es", categorySlug: "coffee", price: "25000", variants: [{ name: "Regular", sku: "COF-ICE-LAT-R", price: "25000" }, { name: "Large", sku: "COF-ICE-LAT-L", price: "30000" }], addonNames: ["Extra Shot", "Oat Milk", "Vanilla"], recipe: [{ ingredientName: "Coffee Beans", quantity: "18" }, { ingredientName: "Fresh Milk", quantity: "200" }, { ingredientName: "Vanilla Syrup", quantity: "20" }, { ingredientName: "Ice", quantity: "150" }] },
  { name: "Matcha Latte", sku: "NC-MAT-001", description: "Matcha dan susu segar", categorySlug: "non-coffee", price: "30000", recipe: [{ ingredientName: "Matcha Powder", quantity: "8" }, { ingredientName: "Fresh Milk", quantity: "200" }] },
  { name: "Chocolate", sku: "NC-CHO-001", description: "Minuman cokelat hangat atau dingin", categorySlug: "non-coffee", price: "27000", recipe: [{ ingredientName: "Chocolate Powder", quantity: "25" }, { ingredientName: "Fresh Milk", quantity: "200" }] },
  { name: "Earl Grey Tea", sku: "TEA-EGR-001", description: "Teh hitam aromatik", categorySlug: "tea", price: "20000", recipe: [{ ingredientName: "Black Tea", quantity: "5" }] },
  { name: "Croissant", sku: "FOO-CRO-001", description: "Croissant panggang hangat", categorySlug: "food", price: "22000", recipe: [{ ingredientName: "Croissant", quantity: "1" }] },
  { name: "French Fries", sku: "FOO-FRF-001", description: "Kentang goreng renyah", categorySlug: "food", price: "24000", recipe: [{ ingredientName: "Potatoes", quantity: "180" }] },
  { name: "Cheesecake", sku: "DES-CHE-001", description: "Potongan cheesecake lembut", categorySlug: "dessert", price: "35000", recipe: [{ ingredientName: "Cheesecake", quantity: "1" }] },
];

export function getSeedCatalog() {
  return structuredClone({
    categories: CATEGORIES,
    ingredients: INGREDIENTS,
    addons: ADDONS,
    products: PRODUCTS,
    tables: [
      { name: "Meja 1", capacity: 2 },
      { name: "Meja 2", capacity: 2 },
      { name: "Meja 3", capacity: 4 },
      { name: "Meja 4", capacity: 4 },
      { name: "Meja 5", capacity: 6 },
    ],
  });
}
