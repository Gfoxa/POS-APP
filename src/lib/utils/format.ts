export type DecimalLike = string | { toFixed(decimalPlaces?: number): string };

const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

export function formatIdr(amount: DecimalLike): string {
  const fixed = typeof amount === "string" ? amount : amount.toFixed(2);
  if (!/^-?\d+(?:\.\d+)?$/.test(fixed)) {
    throw new RangeError("Amount must be a plain decimal value.");
  }

  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole, fractional = ""] = unsigned.split(".");
  const integer = BigInt(whole);
  const exactWhole = rupiahFormatter.format(negative ? -integer : integer);
  const exactFraction = fractional.padEnd(2, "0").slice(0, 2);
  const fractionText = exactFraction === "00" ? "" : `,${exactFraction.replace(/0+$/, "")}`;
  return `Rp ${exactWhole}${fractionText}`;
}

export function formatIdrUnitCost(amount: DecimalLike): string {
  const fixed = typeof amount === "string" ? amount : amount.toFixed(4);
  if (!/^-?\d+(?:\.\d+)?$/.test(fixed)) throw new RangeError("Amount must be a plain decimal value.");
  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole, fractional = ""] = unsigned.split(".");
  return `${formatIdr(`${negative ? "-" : ""}${whole}`)},${fractional.padEnd(4, "0").slice(0, 4)}`;
}

export function formatDateTimeId(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function getStartOfJakartaDay(now = new Date()): Date {
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const jakartaNow = new Date(now.getTime() + jakartaOffset);
  const utcMidnightForJakartaDate = Date.UTC(
    jakartaNow.getUTCFullYear(),
    jakartaNow.getUTCMonth(),
    jakartaNow.getUTCDate(),
  );
  return new Date(utcMidnightForJakartaDate - jakartaOffset);
}
