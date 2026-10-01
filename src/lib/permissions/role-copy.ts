import type { UserRole } from "./roles";

export const ROLE_COPY: Record<UserRole, string> = {
  OWNER: "Atur ritme hari ini, pantau hal penting, dan siapkan tim untuk melayani dengan baik.",
  MANAGER: "Lihat keadaan operasional dan bantu tim menjaga layanan tetap lancar.",
  CASHIER: "Proses transaksi, kelola meja, dan lanjutkan pesanan pelanggan melalui menu kasir.",
  KITCHEN: "Pantau antrean pesanan dan perbarui status persiapan melalui layar dapur.",
};
