import { parseAndroidPosUrl } from "./src/lib/android/pos-url";

const serverUrl = process.env.ANDROID_POS_URL
  ? parseAndroidPosUrl(process.env.ANDROID_POS_URL)
  : undefined;

const config = {
  appId: "com.kopisore.pos",
  appName: "Kopi Sore POS",
  webDir: "android-web",
  ...(serverUrl ? { server: { url: serverUrl } } : {}),
};

export default config;
