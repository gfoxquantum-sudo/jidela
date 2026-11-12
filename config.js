/* 記得啦 — 服務設定
   兩個值都留空 = 示範模式（登入只是模擬，資料不離開裝置）。
   填上你的 Supabase 專案資料後，登入就會變成真的。

   這兩個值可以公開放在網頁裡：anon key 本來就是給瀏覽器用的，
   真正保護資料的是資料庫的權限規則（supabase/schema.sql）。
   絕對不要把 service_role key 放進任何前端檔案。 */
const CONFIG = {
  supabaseUrl: 'https://badsoburetlpzbnakkal.supabase.co',
  supabaseAnonKey: 'sb_publishable_jqNA1Lw6WivRpN0AOwHFBA_oavZsyVo',  // Supabase 後台 → Project Settings → API Keys → Publishable key（不是 Secret key）
  oauth: [],            // 在 Supabase 後台啟用後再加，例如 ['google'] 或 ['apple', 'google']
};
