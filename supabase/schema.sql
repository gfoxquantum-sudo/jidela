-- 記得啦 資料庫設定
-- 用法：Supabase 後台 → SQL Editor → 貼上整份 → Run（只需要跑一次）

-- 每個帳號一筆：記錄方案。帳號刪除時這筆也會跟著刪。
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free', 'pro')),
  plan_cycle text check (plan_cycle in ('monthly', 'yearly')),
  plan_until timestamptz,
  created_at timestamptz not null default now()
);

-- 權限：登入的人只能「讀」自己那一筆。
-- 故意不給新增／修改／刪除的權限，所以使用者沒辦法從瀏覽器把自己改成 Pro；
-- 方案只能由你在後台、或之後的付款伺服器（用 service_role）來改。
alter table public.profiles enable row level security;

-- 新的 Supabase 專案不會自動開放資料表給登入的人，要明確給「讀」的權限（只有讀）
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- 有人註冊時自動建立他的 profile
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- App 裡的「刪除帳號」按鈕會呼叫這個：只能刪掉呼叫者自己
create function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
