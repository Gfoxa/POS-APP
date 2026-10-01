export type OrderActionState = {
  message: string;
  error?: boolean;
  orderId?: string;
  orderNumber?: string;
};

export const EMPTY_ORDER_ACTION_STATE: OrderActionState = { message: "" };
