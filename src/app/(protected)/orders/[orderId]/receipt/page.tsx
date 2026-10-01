import { notFound } from "next/navigation";
import { Receipt } from "@/components/pos/receipt";
import { requireRouteAccess } from "@/lib/auth/guards";
import { orderIdSchema } from "@/server/orders/validation";
import { getOrderForReceipt } from "@/server/services/orders";
import { calculateOrderTotals } from "@/server/orders/calculation";
import { canViewOrder } from "@/server/orders/access";
import { getCafeSettings } from "@/server/services/settings";

export default async function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requireRouteAccess("orders");
  const { orderId } = await params;
  if (!orderIdSchema.safeParse(orderId).success) notFound();
  const order = await getOrderForReceipt(orderId);
  const cafe = await getCafeSettings();
  if (!order || !order.payments.length || order.status === "DRAFT" || order.status === "CANCELLED") notFound();
  if (!canViewOrder(user.role, user.id, order.cashierId)) notFound();
  const payment = order.payments.find((entry) => entry.kind === "CHARGE");
  if (!payment) notFound();
  const items = order.items.map((item) => {
    const lineTotal = calculateOrderTotals({
      lines: [{ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2), addons: [] }],
      taxRateBasisPoints: 0, serviceChargeRateBasisPoints: 0,
    }).subtotal;
    return {
      id: item.id, productName: item.productName, variantName: item.variantName, quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2), note: item.note, lineTotal,
      addons: item.addons.map((addon) => ({
        name: addon.addonName, unitPrice: addon.unitPrice.toFixed(2), quantity: addon.quantity,
        total: calculateOrderTotals({
          lines: [{ productId: item.productId, quantity: item.quantity * addon.quantity, unitPrice: addon.unitPrice.toFixed(2), addons: [] }],
          taxRateBasisPoints: 0, serviceChargeRateBasisPoints: 0,
        }).subtotal,
      })),
    };
  });
  return <Receipt order={{
    cafeName: cafe.name, cafeAddress: cafe.address, cafePhone: cafe.phone,
    orderNumber: order.orderNumber, status: order.status, type: order.type, createdAt: order.createdAt.toISOString(),
    cashierName: order.cashier.name, customer: order.customer, subtotal: order.subtotal.toFixed(2),
    discountName: order.discountName, discountAmount: order.discountAmount.toFixed(2), taxRate: order.taxRate.toFixed(5),
    taxAmount: order.taxAmount.toFixed(2), serviceChargeRate: order.serviceChargeRate.toFixed(5),
    serviceChargeAmount: order.serviceChargeAmount.toFixed(2), total: order.total.toFixed(2), note: order.note, items,
    payment: {
      method: payment.method, amount: payment.amount.toFixed(2),
      tenderedAmount: payment.tenderedAmount?.toFixed(2) ?? payment.amount.toFixed(2),
      changeAmount: payment.changeAmount?.toFixed(2) ?? "0.00",
      referenceNumber: payment.referenceNumber, paidAt: payment.paidAt.toISOString(),
    },
    refund: order.payments.find((entry) => entry.kind === "REFUND") ? {
      amount: order.payments.find((entry) => entry.kind === "REFUND")!.amount.toFixed(2),
      paidAt: order.payments.find((entry) => entry.kind === "REFUND")!.paidAt.toISOString(),
    } : null,
  }} />;
}
