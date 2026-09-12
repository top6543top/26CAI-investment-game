begin;

select pg_temp.test_assert(
  host_toggle_pause(true) = true,
  'toggle_pause returns the new paused state'
);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = true,
  'game_state.is_paused updated to true'
);

select host_toggle_pause(false);

select pg_temp.test_assert(
  (select is_paused from game_state where id = 1) = false,
  'game_state.is_paused updated to false'
);

rollback;
