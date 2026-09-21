alter table public.profiles
  add constraint profiles_avatar_path_owned
  check (avatar_path is null or avatar_path like user_id::text || '/%');
