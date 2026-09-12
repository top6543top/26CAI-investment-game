-- Drop the host PIN and participant password gates entirely: the host
-- console and team join screen no longer ask for either, so the checks
-- and their storage are dead weight.
drop function if exists host_start_game(text);
drop function if exists host_toggle_pause(text, boolean);
drop function if exists host_next_year(text);
drop function if exists host_end_game(text);
drop function if exists host_reset_game(text);
drop function if exists set_host_pin(text);
drop function if exists join_game(text, text);
drop table if exists host_config;

alter table participants drop column password_hash;
revoke select on participants from anon, authenticated;
grant select on participants to anon, authenticated;

create function join_game(p_nickname text)
returns table (id uuid, nickname text, cash bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
  v_existing participants%rowtype;
begin
  if trim(p_nickname) = '' then
    raise exception '닉네임을 입력해주세요';
  end if;

  select current_round into v_round from game_state where game_state.id = 1;
  if v_round = 12 then
    raise exception '게임이 이미 종료되었습니다';
  end if;

  select * into v_existing from participants where participants.nickname = trim(p_nickname);
  if found then
    return query select v_existing.id, v_existing.nickname::text, v_existing.cash;
    return;
  end if;

  return query
    insert into participants (nickname, cash)
    values (trim(p_nickname), 1200000)
    returning participants.id, participants.nickname::text, participants.cash;
end;
$$;

create function host_start_game()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
begin
  select current_round into v_round from game_state where id = 1;
  if v_round <> 0 then
    raise exception '대기 상태(0)에서만 게임을 시작할 수 있습니다 (현재: %)', v_round;
  end if;

  insert into asset_history (round, year_label, participant_id, nickname, total_assets, round_profit)
  select 1, (select year_label from rounds where rounds.round = 1), p.id, p.nickname::text, p.cash, 0
  from participants p
  on conflict (round, participant_id) do update
    set total_assets = excluded.total_assets, round_profit = excluded.round_profit, updated_at = now();

  update game_state set current_round = 1, is_paused = false, updated_at = now() where id = 1;
end;
$$;

create function host_toggle_pause(p_paused boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update game_state set is_paused = p_paused, updated_at = now() where id = 1;
  return p_paused;
end;
$$;

create function host_next_year()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
  v_new_round int;
  v_year_label int;
begin
  select current_round into v_round from game_state where id = 1;

  if v_round < 1 or v_round >= 11 then
    raise exception '다음 해로 진행할 수 없는 라운드입니다 (현재: %)', v_round;
  end if;

  v_new_round := v_round + 1;
  select year_label into v_year_label from rounds where rounds.round = v_new_round;

  insert into asset_history (round, year_label, participant_id, nickname, total_assets, round_profit)
  select
    v_new_round,
    v_year_label,
    p.id,
    p.nickname::text,
    p.cash + coalesce(liq.proceeds, 0),
    coalesce(liq.proceeds, 0) - coalesce(liq.cost_basis, 0)
  from participants p
  left join (
    select h.participant_id,
           sum(h.quantity * sp.price)::bigint as proceeds,
           sum(h.total_cost)::bigint as cost_basis
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = v_new_round
    group by h.participant_id
  ) liq on liq.participant_id = p.id
  on conflict (round, participant_id) do update
    set total_assets = excluded.total_assets, round_profit = excluded.round_profit, updated_at = now();

  update participants p
  set cash = p.cash + coalesce(liq.proceeds, 0)
  from (
    select h.participant_id, sum(h.quantity * sp.price)::bigint as proceeds
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = v_new_round
    group by h.participant_id
  ) liq
  where p.id = liq.participant_id;

  delete from holdings where true;

  update game_state set current_round = v_new_round, is_paused = false, updated_at = now() where id = 1;

  return v_new_round;
end;
$$;

create function host_end_game()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_round int;
  v_year_label int;
begin
  select current_round into v_round from game_state where id = 1;
  if v_round <> 11 then
    raise exception '마지막 라운드(11)에서만 게임을 종료할 수 있습니다 (현재: %)', v_round;
  end if;

  select year_label into v_year_label from rounds where rounds.round = 11;

  insert into asset_history (round, year_label, participant_id, nickname, total_assets, round_profit)
  select
    11,
    v_year_label,
    p.id,
    p.nickname::text,
    p.cash + coalesce(liq.proceeds, 0),
    coalesce(liq.proceeds, 0) - coalesce(liq.cost_basis, 0)
  from participants p
  left join (
    select h.participant_id,
           sum(h.quantity * sp.price)::bigint as proceeds,
           sum(h.total_cost)::bigint as cost_basis
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = 11
    group by h.participant_id
  ) liq on liq.participant_id = p.id
  on conflict (round, participant_id) do update
    set total_assets = excluded.total_assets, round_profit = excluded.round_profit, updated_at = now();

  update participants p
  set cash = p.cash + coalesce(liq.proceeds, 0)
  from (
    select h.participant_id, sum(h.quantity * sp.price)::bigint as proceeds
    from holdings h
    join stock_prices sp on sp.stock_id = h.stock_id and sp.round = 11
    group by h.participant_id
  ) liq
  where p.id = liq.participant_id;

  delete from holdings where true;

  update game_state set current_round = 12, is_paused = false, updated_at = now() where id = 1;
end;
$$;

create function host_reset_game()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from holdings where true;
  delete from participants where true;
  update game_state set current_round = 0, is_paused = false, updated_at = now() where id = 1;
end;
$$;
