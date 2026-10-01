"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTimeId, formatIdr } from "@/lib/utils/format";
import { calculateOrderTotals, validateTender } from "@/server/orders/calculation";
import { EMPTY_ORDER_ACTION_STATE } from "@/server/orders/action-state";
import { cancelDraftAction, checkoutCartAction, saveDraftAction } from "@/server/actions/orders";
import { splitDraftAction } from "@/server/actions/tables";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";

type Product = {
  id: string; name: string; sku: string; categoryId: string; categoryName: string; basePrice: string;
  variants: { id: string; name: string; sku: string; price: string }[];
  addons: { id: string; name: string; price: string }[];
};
type Discount = { id: string; name: string; type: "PERCENTAGE" | "FIXED_AMOUNT"; scope: "PRODUCT" | "ORDER"; value: string; maxAmount: string | null; productId: string | null };
type CartLine = { key: string; productId: string; variantId: string | null; addonIds: string[]; quantity: number; note: string };
type Draft = { id: string; orderNumber: string; note: string | null; type: "DINE_IN" | "TAKEAWAY"; tableId: string | null; customerId: string | null; discountId: string | null; total: string; updatedAt: Date; lines: { id: string; productId: string; productName: string; variantName: string | null; variantId: string | null; addonIds: string[]; quantity: number; note: string | null }[] };
type PosData = {
  taxRateBasisPoints: number;
  serviceChargeRateBasisPoints: number;
  categories: { id: string; name: string }[];
  products: Product[];
  customers: { id: string; name: string; phone: string | null }[];
  discounts: Discount[];
  drafts: Draft[];
  tables: { id: string; name: string; capacity: number; status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING"; members: string[] }[];
};

function percentLabel(basisPoints: number) {
  const value = BigInt(basisPoints);
  const whole = value / 100n;
  const hundredths = value % 100n;
  return hundredths === 0n ? whole.toString() : `${whole}.${hundredths.toString().padStart(2, "0")}`;
}

const PAYMENT_METHODS = [
  ["CASH", "Tunai"], ["QRIS", "QRIS"], ["DEBIT", "Debit"], ["CREDIT_CARD", "Kartu kredit"], ["OTHER", "Lainnya"],
] as const;

function CancelDraftForm({ id, orderNumber }: { id: string; orderNumber: string }) {
  const [state, action, pending] = useActionState(cancelDraftAction, EMPTY_ORDER_ACTION_STATE);
  return <form action={action}><input name="orderId" type="hidden" value={id} /><button aria-label={`Batalkan ${orderNumber}`} disabled={pending} type="submit">×</button>{state.message && <span className="sr-only">{state.message}</span>}</form>;
}

function SplitDraftForm({ draft }: { draft: Draft }) {
  const [state, action, pending] = useActionState(splitDraftAction, { message: "" });
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  if (draft.type !== "DINE_IN") return null;
  const selected = draft.lines.flatMap((line) => quantities[line.id] ? [{ orderItemId: line.id, quantity: quantities[line.id] }] : []);
  return <form action={action} className="pos-split-form">
    <input name="orderId" type="hidden" value={draft.id} />
    <input name="lines" type="hidden" value={JSON.stringify(selected)} />
    <details><summary>Pisah tagihan</summary>
      {draft.discountId && <p>Hapus diskon sebelum memisahkan tagihan.</p>}
      {draft.lines.map((line) => <label key={line.id}>{line.productName}{line.variantName ? ` · ${line.variantName}` : ""} · tersedia {line.quantity}<input aria-label={`Jumlah dipisah ${line.productName}`} max={line.quantity} min={0} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: Math.max(0, Math.min(line.quantity, Number(event.target.value) || 0)) }))} type="number" value={quantities[line.id] ?? 0} /></label>)}
      <button className="catalog-button catalog-button--small" disabled={pending || !selected.length || Boolean(draft.discountId)} type="submit">{pending ? "Memisahkan…" : "Pisahkan"}</button>
      {state.message && <span role={state.error ? "alert" : "status"}>{state.message}</span>}
    </details>
  </form>;
}

function newKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PosWorkspace({ data }: { data: PosData }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [checkoutKey, setCheckoutKey] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productNote, setProductNote] = useState("");
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY">("DINE_IN");
  const [tableId, setTableId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [discountId, setDiscountId] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number][0]>("CASH");
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [tenderTouched, setTenderTouched] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [draftState, saveAction, savePending] = useActionState(saveDraftAction, EMPTY_ORDER_ACTION_STATE);
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(checkoutCartAction, EMPTY_ORDER_ACTION_STATE);

  useEffect(() => { setCheckoutKey(newKey()); }, []);

  const selectedProduct = data.products.find((product) => product.id === selectedProductId);
  const cartDiscount = data.discounts.find((discount) => discount.id === discountId);
  const totals = useMemo(() => calculateOrderTotals({
    lines: cart.map((line) => {
      const product = data.products.find((item) => item.id === line.productId);
      const variant = product?.variants.find((item) => item.id === line.variantId);
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: variant?.price ?? product?.basePrice ?? "0.00",
        addons: (product?.addons ?? []).filter((addon) => line.addonIds.includes(addon.id)).map((addon) => ({ unitPrice: addon.price, quantity: 1 })),
      };
    }),
    discount: cartDiscount ?? null,
    taxRateBasisPoints: data.taxRateBasisPoints,
    serviceChargeRateBasisPoints: data.serviceChargeRateBasisPoints,
  }), [cart, cartDiscount, data.products, data.taxRateBasisPoints, data.serviceChargeRateBasisPoints]);
  const filteredProducts = data.products.filter((product) => {
    const matchesCategory = !categoryId || product.categoryId === categoryId;
    const term = query.trim().toLocaleLowerCase("id-ID");
    return matchesCategory && (!term || product.name.toLocaleLowerCase("id-ID").includes(term) || product.sku.toLocaleLowerCase("id-ID").includes(term));
  });
  const eligibleDiscounts = data.discounts.filter((discount) => discount.scope === "ORDER" || cart.some((line) => line.productId === discount.productId));

  useEffect(() => {
    if (draftState.orderId && !draftState.error) {
      setCart([]);
      setEditingOrderId("");
      setOrderNote("");
      setCustomerId("");
      setDiscountId("");
      setTenderTouched(false);
      setTenderedAmount("");
      setReferenceNumber("");
      setCheckoutKey(newKey());
    }
  }, [draftState]);
  useEffect(() => {
    if (checkoutState.orderId) setEditingOrderId(checkoutState.orderId);
    if (!checkoutState.error && checkoutState.orderId) {
      setCart([]);
      setEditingOrderId("");
      setOrderNote("");
      setCustomerId("");
      setDiscountId("");
      setTenderTouched(false);
      setCheckoutKey(newKey());
      setReferenceNumber("");
    }
  }, [checkoutState.error, checkoutState.orderId]);
  useEffect(() => {
    if (paymentMethod !== "CASH" || !tenderTouched) setTenderedAmount(totals.total);
    else if (!tenderedAmount) setTenderedAmount(totals.total);
  }, [paymentMethod, tenderTouched, tenderedAmount, totals.total]);

  const tenderFeedback = (() => {
    if (!tenderedAmount || !cart.length) return null;
    try {
      return validateTender(paymentMethod, totals.total, tenderedAmount);
    } catch {
      return null;
    }
  })();

  function chooseProduct(product: Product) {
    if (!product.variants.length && !product.addons.length) {
      setCart((current) => [...current, { key: newKey(), productId: product.id, variantId: null, addonIds: [], quantity: 1, note: "" }]);
      return;
    }
    setSelectedProductId(product.id);
    setVariantId("");
    setAddonIds([]);
    setProductQuantity(1);
    setProductNote("");
  }

  function addConfiguredProduct() {
    if (!selectedProduct) return;
    if (!Number.isInteger(productQuantity) || productQuantity < 1 || productQuantity > 100) {
      setQuantityError("Jumlah harus bilangan bulat antara 1 dan 100.");
      return;
    }
    setQuantityError("");
    setCart((current) => [...current, {
      key: newKey(), productId: selectedProduct.id, variantId: variantId || null,
      addonIds, quantity: productQuantity, note: productNote,
    }]);
    setSelectedProductId("");
  }

  function resumeDraft(draft: Draft) {
    setEditingOrderId(draft.id);
    setCart(draft.lines.map((line) => ({ ...line, key: newKey(), note: line.note ?? "" })));
    setOrderType(draft.type);
    setTableId(draft.tableId ?? "");
    setCustomerId(draft.customerId ?? "");
    setDiscountId(draft.discountId ?? "");
    setOrderNote(draft.note ?? "");
    setTenderTouched(false);
  }

  function orderFormFields() {
    return <>
      <input name="orderId" type="hidden" value={editingOrderId} />
      <input name="type" type="hidden" value={orderType} />
      <input name="tableId" type="hidden" value={orderType === "DINE_IN" ? tableId : ""} />
      <input name="customerId" type="hidden" value={customerId} />
      <input name="discountId" type="hidden" value={discountId} />
      <input name="note" type="hidden" value={orderNote} />
      <input name="cart" type="hidden" value={JSON.stringify(cart.map(({ productId, variantId, addonIds, quantity, note }) => ({ productId, variantId, addonIds, quantity, note })))} />
    </>;
  }

  return (
    <div className="pos-page">
      <header className="pos-heading">
        <div><span className="eyebrow">KASIR / TRANSAKSI BARU</span><h1>Kasir</h1><p>Pilih menu, simpan pesanan, lalu selesaikan pembayaran.</p></div>
        <Link className="catalog-button catalog-button--secondary" href="/orders">Riwayat pesanan</Link>
      </header>

      <div className="pos-layout">
        <section className="pos-menu-panel" aria-label="Daftar menu">
          <div className="pos-menu-toolbar">
            <label className="catalog-field pos-search"><span>Cari menu</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau SKU" value={query} /></label>
            <div className="pos-categories" aria-label="Filter kategori">
              <button aria-pressed={!categoryId} className={!categoryId ? "pos-category pos-category--active" : "pos-category"} onClick={() => setCategoryId("")} type="button">Semua</button>
              {data.categories.map((category) => <button aria-pressed={categoryId === category.id} className={categoryId === category.id ? "pos-category pos-category--active" : "pos-category"} key={category.id} onClick={() => setCategoryId(category.id)} type="button">{category.name}</button>)}
            </div>
          </div>
          {filteredProducts.length ? <div className="pos-product-grid">{filteredProducts.map((product) => (
            <button className="pos-product-card" key={product.id} onClick={() => chooseProduct(product)} type="button">
              <span className="pos-product-category">{product.categoryName}</span><strong>{product.name}</strong><span className="pos-product-price">Mulai {formatIdr(product.variants.length ? product.variants[0].price : product.basePrice)}</span>
              {(product.variants.length > 0 || product.addons.length > 0) && <small>Opsi tersedia · pilih</small>}
            </button>
          ))}</div> : <div className="catalog-empty"><strong>Menu tidak ditemukan</strong><p>Ubah pencarian atau pilih kategori lain.</p></div>}

          {selectedProduct && <div className="pos-config-backdrop" role="presentation" onClick={() => setSelectedProductId("")}>
            <section aria-labelledby="pos-config-title" aria-modal="true" className="pos-config-panel" onClick={(event) => event.stopPropagation()} role="dialog">
              <div className="pos-config-heading"><div><span className="eyebrow">SESUAIKAN MENU</span><h2 id="pos-config-title">{selectedProduct.name}</h2></div><button aria-label="Tutup" className="pos-icon-button" onClick={() => setSelectedProductId("")} type="button">×</button></div>
              {selectedProduct.variants.length > 0 && <fieldset className="pos-option-group"><legend>Ukuran</legend><label className="pos-option"><input checked={!variantId} name="variant" onChange={() => setVariantId("")} type="radio" /><span>Harga dasar</span><strong>{formatIdr(selectedProduct.basePrice)}</strong></label>{selectedProduct.variants.map((variant) => <label className="pos-option" key={variant.id}><input checked={variantId === variant.id} name="variant" onChange={() => setVariantId(variant.id)} type="radio" /><span>{variant.name}</span><strong>{formatIdr(variant.price)}</strong></label>)}</fieldset>}
              {selectedProduct.addons.length > 0 && <fieldset className="pos-option-group"><legend>Tambahan</legend>{selectedProduct.addons.map((addon) => <label className="pos-option" key={addon.id}><input checked={addonIds.includes(addon.id)} onChange={(event) => setAddonIds((current) => event.target.checked ? [...current, addon.id] : current.filter((id) => id !== addon.id))} type="checkbox" /><span>{addon.name}</span><strong>+ {formatIdr(addon.price)}</strong></label>)}</fieldset>}
              <div className="pos-config-controls"><label className="catalog-field"><span>Jumlah</span><input max={100} min={1} onChange={(event) => { const next = Number(event.target.value); setProductQuantity(Number.isFinite(next) ? next : 0); setQuantityError(""); }} step={1} type="number" value={productQuantity} /></label><label className="catalog-field"><span>Catatan <small>Opsional</small></span><input maxLength={500} onChange={(event) => setProductNote(event.target.value)} placeholder="Contoh: kurang gula" value={productNote} /></label></div>
              {quantityError && <p className="catalog-feedback catalog-feedback--error" role="alert">{quantityError}</p>}
              <button className="catalog-button catalog-button--primary" onClick={addConfiguredProduct} type="button">Tambah ke pesanan</button>
            </section>
          </div>}
        </section>

        <aside className="pos-order-panel" aria-label="Pesanan saat ini">
          <div className="pos-order-heading"><div><span className="eyebrow">PESANAN AKTIF</span><h2>{editingOrderId ? "Lanjutkan draft" : "Pesanan baru"}</h2></div><span className="pos-line-count">{cart.reduce((count, line) => count + line.quantity, 0)} item</span></div>
          <div className="pos-order-meta">
            <label className="catalog-field"><span>Tipe pesanan</span><select onChange={(event) => { const next = event.target.value as "DINE_IN" | "TAKEAWAY"; setOrderType(next); if (next === "TAKEAWAY") setTableId(""); }} value={orderType}><option value="DINE_IN">Makan di tempat</option><option value="TAKEAWAY">Bawa pulang</option></select></label>
            {orderType === "DINE_IN" && <label className="catalog-field"><span>Meja</span><select onChange={(event) => setTableId(event.target.value)} required value={tableId}><option value="">Pilih meja</option>{data.tables.map((table) => <option disabled={table.status === "RESERVED" || table.status === "CLEANING"} key={table.id} value={table.id}>{table.members.join(" + ")} · {table.capacity} kursi · {table.status === "OCCUPIED" ? "Terisi" : table.status === "RESERVED" ? "Dipesan" : table.status === "CLEANING" ? "Dibersihkan" : "Tersedia"}</option>)}</select></label>}
            <label className="catalog-field"><span>Pelanggan <small>Opsional</small></span><select onChange={(event) => setCustomerId(event.target.value)} value={customerId}><option value="">Tanpa pelanggan</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label>
            <label className="catalog-field"><span>Diskon</span><select onChange={(event) => setDiscountId(event.target.value)} value={discountId}><option value="">Tanpa diskon</option>{eligibleDiscounts.map((discount) => <option key={discount.id} value={discount.id}>{discount.name}</option>)}</select></label>
            <label className="catalog-field"><span>Catatan pesanan <small>Opsional</small></span><input maxLength={1000} onChange={(event) => setOrderNote(event.target.value)} placeholder="Catatan untuk tim" value={orderNote} /></label>
          </div>

          <div className="pos-cart-list">
            {cart.length ? cart.map((line) => {
              const product = data.products.find((item) => item.id === line.productId);
              const variant = product?.variants.find((item) => item.id === line.variantId);
              const selectedAddons = (product?.addons ?? []).filter((addon) => line.addonIds.includes(addon.id));
              const lineSubtotal = calculateOrderTotals({
                lines: [{ productId: line.productId, quantity: line.quantity, unitPrice: variant?.price ?? product?.basePrice ?? "0.00", addons: selectedAddons.map((addon) => ({ unitPrice: addon.price, quantity: 1 })) }],
                taxRateBasisPoints: 0, serviceChargeRateBasisPoints: 0,
              }).subtotal;
              return <article className="pos-cart-item" key={line.key}>
                <div className="pos-cart-item-top"><div><strong>{product?.name ?? "Menu tidak tersedia"}{variant ? ` · ${variant.name}` : ""}</strong><span>{selectedAddons.map((addon) => addon.name).join(", ") || "Tanpa tambahan"}</span></div><strong className="pos-cart-item-price">{formatIdr(lineSubtotal)}</strong></div>
                <div className="pos-cart-item-bottom"><div className="pos-quantity-control"><button aria-label={`Kurangi ${product?.name ?? "produk"}`} disabled={line.quantity <= 1} onClick={() => setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity: item.quantity - 1 } : item))} type="button">−</button><span>{line.quantity}</span><button aria-label={`Tambah ${product?.name ?? "produk"}`} disabled={line.quantity >= 100} onClick={() => setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))} type="button">+</button></div><label className="pos-item-note"><span className="sr-only">Catatan item</span><input maxLength={500} onChange={(event) => setCart((current) => current.map((item) => item.key === line.key ? { ...item, note: event.target.value } : item))} placeholder="Catatan item" value={line.note} /></label><button aria-label={`Hapus ${product?.name ?? "produk"}`} className="pos-remove-item" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))} type="button">Hapus</button></div>
              </article>;
            }) : <div className="pos-cart-empty"><span>+</span><strong>Belum ada menu</strong><small>Pilih menu di sebelah kiri untuk memulai.</small></div>}
          </div>

          <div className="pos-order-totals">
            <div><span>Subtotal</span><strong>{formatIdr(totals.subtotal)}</strong></div>
            <div><span>Diskon</span><strong>− {formatIdr(totals.discountAmount)}</strong></div>
            <div><span>Pajak ({percentLabel(data.taxRateBasisPoints)}%)</span><strong>{formatIdr(totals.taxAmount)}</strong></div>
            <div><span>Biaya layanan ({percentLabel(data.serviceChargeRateBasisPoints)}%)</span><strong>{formatIdr(totals.serviceChargeAmount)}</strong></div>
            <div className="pos-grand-total"><span>Total</span><strong>{formatIdr(totals.total)}</strong></div>
          </div>

          <form action={saveAction} className="pos-order-actions">
            {orderFormFields()}
            <button className="catalog-button catalog-button--secondary" disabled={!cart.length || savePending || checkoutPending} type="submit">{savePending ? "Menyimpan…" : editingOrderId ? "Simpan perubahan" : "Tahan pesanan"}</button>
          </form>
          <CatalogFeedback error={draftState.error} message={draftState.message} />

          <form action={checkoutAction} className="pos-payment-form">
            {orderFormFields()}
            <input name="checkoutKey" type="hidden" value={checkoutKey} />
            <label className="catalog-field"><span>Metode pembayaran</span><select name="method" onChange={(event) => { setPaymentMethod(event.target.value as (typeof PAYMENT_METHODS)[number][0]); setTenderTouched(false); }} value={paymentMethod}>{PAYMENT_METHODS.map(([method, label]) => <option key={method} value={method}>{label}</option>)}</select></label>
            <label className="catalog-field"><span>{paymentMethod === "CASH" ? "Uang diterima · Rp" : "Jumlah dibayar · Rp"}</span><input inputMode="decimal" name="tenderedAmount" onChange={(event) => { setTenderedAmount(event.target.value); setTenderTouched(true); }} required value={tenderedAmount} /></label>
            {paymentMethod === "CASH" && <div className="pos-change-preview"><span>Kembalian</span><strong>{tenderFeedback ? formatIdr(tenderFeedback.changeAmount) : "—"}</strong></div>}
            {paymentMethod !== "CASH" && <label className="catalog-field"><span>Nomor referensi <small>Opsional</small></span><input maxLength={100} name="referenceNumber" onChange={(event) => setReferenceNumber(event.target.value)} placeholder="ID transaksi" value={referenceNumber} /></label>}
            <button className="catalog-button catalog-button--primary pos-pay-button" disabled={!cart.length || !checkoutKey || checkoutPending || savePending} type="submit">{checkoutPending ? "Memproses pembayaran…" : `Bayar ${formatIdr(totals.total)}`}</button>
          </form>
          {checkoutState.error ? <CatalogFeedback error message={checkoutState.message} /> : checkoutState.orderId && cart.length === 0 ? <div className="pos-success"><strong>{checkoutState.message}</strong><Link href={`/orders/${checkoutState.orderId}/receipt`}>Buka dan cetak struk ↗</Link></div> : null}

          {data.drafts.length > 0 && <section className="pos-held-orders"><div className="pos-held-heading"><h3>Pesanan ditahan</h3><span>{data.drafts.length}</span></div>{data.drafts.map((draft) => <article className="pos-held-order" key={draft.id}><div><strong>{draft.orderNumber}</strong><span>{formatDateTimeId(new Date(draft.updatedAt))} · {formatIdr(draft.total)}</span></div><button onClick={() => resumeDraft(draft)} type="button">Lanjut</button><CancelDraftForm id={draft.id} orderNumber={draft.orderNumber} /><SplitDraftForm draft={draft} /></article>)}</section>}
        </aside>
      </div>
    </div>
  );
}
