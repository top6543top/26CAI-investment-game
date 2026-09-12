-- Uni-DTHON 리브랜딩: 8개 대학 종목으로 전면 교체 + 상장폐지 기능 추가.
-- 종목 로스터가 통째로 바뀌므로 기존 참가자/보유/자산이력 데이터를 초기화한다.
delete from participants;   -- cascades holdings, asset_history
delete from stock_prices;
delete from stocks;

alter table stocks add column if not exists delisted_round int;

insert into stocks (name, display_order) values
  ('성균반도체', 1), ('동국필름', 2), ('이화패션', 3), ('경희한방', 4),
  ('숭실전자', 5), ('숙명디자인', 6), ('중앙미디어', 7), ('시립도시개발', 8);

insert into stock_prices (stock_id, round, price)
select s.id, r.round, v.price
from (values
  ('성균반도체', 2016, 50000), ('성균반도체', 2017, 72000), ('성균반도체', 2018, 60000), ('성균반도체', 2019, 48000), ('성균반도체', 2020, 65000), ('성균반도체', 2021, 88000), ('성균반도체', 2022, 50000), ('성균반도체', 2023, 58000), ('성균반도체', 2024, 105000), ('성균반도체', 2025, 130000), ('성균반도체', 2026, 150000),
  ('동국필름', 2016, 30000), ('동국필름', 2017, 33000), ('동국필름', 2018, 28000), ('동국필름', 2019, 32000), ('동국필름', 2020, 7500), ('동국필름', 2021, 10500), ('동국필름', 2022, 16500), ('동국필름', 2023, 21000), ('동국필름', 2024, 25500), ('동국필름', 2025, 28500), ('동국필름', 2026, 31500),
  ('이화패션', 2016, 80000), ('이화패션', 2017, 48000), ('이화패션', 2018, 56000), ('이화패션', 2019, 52000), ('이화패션', 2020, 36000), ('이화패션', 2021, 44000), ('이화패션', 2022, 40000), ('이화패션', 2023, 30000), ('이화패션', 2024, 34000), ('이화패션', 2025, 38000), ('이화패션', 2026, 44000),
  ('경희한방', 2016, 35000), ('경희한방', 2017, 38500), ('경희한방', 2018, 42000), ('경희한방', 2019, 40000), ('경희한방', 2020, 63000), ('경희한방', 2021, 52500), ('경희한방', 2022, 45500), ('경희한방', 2023, 51000), ('경희한방', 2024, 56000), ('경희한방', 2025, 61000), ('경희한방', 2026, 66500),
  ('숭실전자', 2016, 60000), ('숭실전자', 2017, 69000), ('숭실전자', 2018, 63000), ('숭실전자', 2019, 75000), ('숭실전자', 2020, 96000), ('숭실전자', 2021, 114000), ('숭실전자', 2022, 72000), ('숭실전자', 2023, 66000), ('숭실전자', 2024, 87000), ('숭실전자', 2025, 102000), ('숭실전자', 2026, 117000),
  ('숙명디자인', 2016, 25000), ('숙명디자인', 2017, 27000), ('숙명디자인', 2018, 24500), ('숙명디자인', 2019, 28000), ('숙명디자인', 2020, 22500), ('숙명디자인', 2021, 31000), ('숙명디자인', 2022, 26000), ('숙명디자인', 2023, 29500), ('숙명디자인', 2024, 32500), ('숙명디자인', 2025, 35000), ('숙명디자인', 2026, 39000),
  ('중앙미디어', 2016, 15000), ('중앙미디어', 2017, 18000), ('중앙미디어', 2018, 21000), ('중앙미디어', 2019, 16500), ('중앙미디어', 2020, 13500), ('중앙미디어', 2021, 24000), ('중앙미디어', 2022, 10500), ('중앙미디어', 2023, 1000), ('중앙미디어', 2024, 1000), ('중앙미디어', 2025, 1000), ('중앙미디어', 2026, 1000),
  ('시립도시개발', 2016, 45000), ('시립도시개발', 2017, 49500), ('시립도시개발', 2018, 54000), ('시립도시개발', 2019, 58500), ('시립도시개발', 2020, 52000), ('시립도시개발', 2021, 67500), ('시립도시개발', 2022, 43000), ('시립도시개발', 2023, 18000), ('시립도시개발', 2024, 1500), ('시립도시개발', 2025, 1500), ('시립도시개발', 2026, 1500)
) as v(stock_name, year, price)
join stocks s on s.name = v.stock_name
join rounds r on r.year_label = v.year;

-- 초록뱀미디어(배임 적발→거래정지→상폐) 모델: 2023년(8라운드)부터 매수 차단.
update stocks set delisted_round = 8 where name = '중앙미디어';
-- 레고랜드발 PF위기로 무너진 중견 건설사 모델: 2024년(9라운드)부터 매수 차단.
update stocks set delisted_round = 9 where name = '시립도시개발';

update game_state set current_round = 0, is_paused = false, updated_at = now() where id = 1;

create or replace function buy_stock(p_nickname text, p_stock_id int, p_quantity int)
returns table (participant_id uuid, cash bigint, stock_id int, quantity int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant participants%rowtype;
  v_round int;
  v_paused boolean;
  v_price int;
  v_cost bigint;
  v_delisted_round int;
  v_stock_name text;
begin
  if p_quantity <= 0 then
    raise exception '수량은 1 이상이어야 합니다';
  end if;

  select current_round, is_paused into v_round, v_paused from game_state where id = 1;

  if v_paused then
    raise exception '거래가 일시정지되었습니다';
  end if;

  if v_round < 1 or v_round > 11 then
    raise exception '현재 매수할 수 있는 라운드가 아닙니다';
  end if;

  select name, delisted_round into v_stock_name, v_delisted_round from stocks where id = p_stock_id;
  if v_delisted_round is not null and v_round >= v_delisted_round then
    raise exception '상장폐지된 종목입니다: %', v_stock_name;
  end if;

  select * into v_participant from participants where nickname = p_nickname;
  if not found then
    raise exception '참가자를 찾을 수 없습니다: %', p_nickname;
  end if;

  select price into v_price from stock_prices where stock_prices.stock_id = p_stock_id and stock_prices.round = v_round;
  if not found then
    raise exception '종목 가격 정보를 찾을 수 없습니다';
  end if;

  v_cost := v_price::bigint * p_quantity;

  if v_cost > v_participant.cash then
    raise exception '현금이 부족합니다 (필요: %, 보유: %)', v_cost, v_participant.cash;
  end if;

  update participants set cash = participants.cash - v_cost where participants.id = v_participant.id;

  begin
    insert into holdings (participant_id, stock_id, quantity, total_cost)
    values (v_participant.id, p_stock_id, p_quantity, v_cost);
  exception when unique_violation then
    update holdings
    set quantity = holdings.quantity + p_quantity,
        total_cost = holdings.total_cost + v_cost
    where holdings.participant_id = v_participant.id and holdings.stock_id = p_stock_id;
  end;

  return query
    select v_participant.id, (v_participant.cash - v_cost), p_stock_id, p_quantity;
end;
$$;
