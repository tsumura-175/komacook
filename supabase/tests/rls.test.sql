begin;

create extension if not exists pgtap with schema extensions;

insert into public.recipes (
  id, owner_user_id, category_id, title, base_servings, visibility, status, source_type
) values (
  '90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  '__test__other_private_recipe',
  2,
  'private',
  'draft',
  'manual'
);

select extensions.plan(18);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.recipes'::regclass),
  'recipesでRLSが有効'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profilesでRLSが有効'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.claim_due_recipe_deletions(integer)', 'execute'),
  '会員はレシピ定期削除の取得関数を実行できない'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.claim_due_account_deletions(integer)', 'execute'),
  '会員は退会定期削除の取得関数を実行できない'
);

set local role anon;
select extensions.ok(
  not has_table_privilege('anon', 'public.contact_rate_limits', 'select'),
  '未ログイン利用者は送信制限の識別情報を閲覧できない'
);
select extensions.ok(
  (select allowed from public.consume_contact_rate_limit(repeat('a', 64))),
  '問い合わせ送信制限は初回を許可する'
);
do $$ begin
  perform * from public.consume_contact_rate_limit(repeat('a', 64));
  perform * from public.consume_contact_rate_limit(repeat('a', 64));
end $$;
select extensions.ok(
  not (select allowed from public.consume_contact_rate_limit(repeat('a', 64))),
  '問い合わせ送信制限は10分以内の4回目を拒否する'
);
select extensions.is(
  (select count(*)::integer from public.recipes where id = '20000000-0000-0000-0000-000000000002'),
  1,
  '未ログイン利用者は公開レシピを閲覧できる'
);
select extensions.is(
  (select count(*)::integer from public.recipes where id = '20000000-0000-0000-0000-000000000006'),
  0,
  '未ログイン利用者は非公開レシピを閲覧できない'
);
select extensions.is(
  (select count(*)::integer from public.search_public_recipes(p_query => '鶏', p_limit => 50)),
  1,
  'DB検索はタイトルと材料を横断し、公開レシピだけを返す'
);
select extensions.is(
  (select count(*)::integer from public.search_public_recipes(p_ingredient => '生鮭', p_limit => 50)),
  1,
  'DB検索は材料条件を適用する'
);
select extensions.is(
  (select count(*)::integer from public.search_public_recipes(p_favorites_only => true, p_limit => 50)),
  0,
  '未ログイン利用者の保存済み絞り込みは結果を返さない'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select extensions.is(
  (select count(*)::integer from public.recipes where id = '20000000-0000-0000-0000-000000000006'),
  1,
  '会員は自分の非公開レシピを閲覧できる'
);
select extensions.is(
  (select count(*)::integer from public.recipes where id = '90000000-0000-4000-8000-000000000001'),
  0,
  '会員は他人の非公開レシピを閲覧できない'
);
select extensions.is_empty(
  $$update public.recipes set title = '__test__forbidden_update'
    where id = '20000000-0000-0000-0000-000000000002' returning id$$,
  '会員は他人の公開レシピを更新できない'
);
select extensions.is_empty(
  $$delete from public.recipes
    where id = '20000000-0000-0000-0000-000000000006' returning id$$,
  '会員はゴミ箱へ移していない自分のレシピを完全削除できない'
);
select extensions.isnt_empty(
  $$update public.recipes set description = '__test__own_update'
    where id = '20000000-0000-0000-0000-000000000006' returning id$$,
  '会員は自分のレシピを更新できる'
);
select extensions.isnt_empty(
  $$delete from public.recipes
    where id = '20000000-0000-0000-0000-000000000009' returning id$$,
  '会員は自分のゴミ箱レシピを完全削除できる'
);

reset role;
select * from extensions.finish();
rollback;
