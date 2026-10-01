import { CafeSettingsForm } from "@/components/settings/cafe-settings-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { getCafeSettings } from "@/server/services/settings";

export default async function SettingsPage() {
  await requireRouteAccess("settings");
  const settings = await getCafeSettings();
  return <div className="catalog-page"><header className="catalog-heading"><div><span className="eyebrow">PENGATURAN / KAFE</span><h1>Pengaturan</h1><p>Identitas kafe dan tarif untuk transaksi baru.</p></div></header><section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">PROFIL KAFE</span><h2>Informasi dan tarif</h2></div></div><CafeSettingsForm settings={settings} /></section></div>;
}
