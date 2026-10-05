-- kill_matrix stores each pairing once: rows are one team, columns the other.
-- Column players' kills are the row players' deaths, so read both orientations.
WITH duels AS (
  SELECT match_id, game_id, row_player_id AS player_id,
         kills, deaths, op_kills, op_deaths
  FROM kill_matrix
  UNION ALL
  SELECT match_id, game_id, col_player_id AS player_id,
         deaths AS kills, kills AS deaths, op_deaths AS op_kills, op_kills AS op_deaths
  FROM kill_matrix
), operators AS (
  SELECT match_id, game_id, player_id,
         SUM(kills)::DOUBLE AS km_kills, SUM(deaths)::DOUBLE AS km_deaths,
         SUM(op_kills)::DOUBLE AS op_kills, SUM(op_deaths)::DOUBLE AS op_deaths
  FROM duels GROUP BY ALL
), games AS (
 SELECT pm.*, mp.map_name, m.utc_timestamp, m.event, m.region, m.is_international,
        (mp.score0+mp.score1)::DOUBLE AS game_rounds,
        (pm.kills_all IS NOT NULL AND pm.deaths_all IS NOT NULL AND pm.assists_all IS NOT NULL) AS kda_reported,
        -- The performance tab stores economy for every scraped game but leaves zero multi-kill and clutch counts blank.
        pm.econ IS NOT NULL AS performance_tab
 FROM player_map pm JOIN matches m USING(match_id) JOIN maps mp USING(match_id,game_id)
 WHERE m.listing_status='Completed' AND NOT m.is_showmatch
       AND mp.score0 IS NOT NULL AND mp.score1 IS NOT NULL
       AND m.utc_timestamp <= current_timestamp
), grouped AS (
 SELECT p.player_name AS player, p.player_id::UBIGINT AS player_id, coalesce(p.country,'') AS country,
        year(g.utc_timestamp)::INTEGER AS season, CASE WHEN g.is_international THEN 'International' ELSE coalesce(g.region,'Unknown') END AS region,
        lower(coalesce(g.agents[1],'unknown')) AS agent,
        coalesce(g.map_name,'Unknown') AS map,
        g.event AS tournament, CASE WHEN g.is_international THEN 'International' ELSE 'Regional' END AS tier,
        count(*)::DOUBLE AS maps,
        sum(g.game_rounds)::DOUBLE AS rounds,
        -- Kills, deaths, and assists share one coverage so per-round rates use matching numerators.
        sum(CASE WHEN g.kda_reported THEN g.kills_all ELSE 0 END)::DOUBLE AS kills,
        sum(CASE WHEN g.kda_reported THEN g.deaths_all ELSE 0 END)::DOUBLE AS deaths,
        sum(CASE WHEN g.kda_reported THEN g.assists_all ELSE 0 END)::DOUBLE AS assists,
        sum(CASE WHEN g.kda_reported THEN g.game_rounds ELSE 0 END)::DOUBLE AS stat_rounds,
        sum(coalesce(g.fk_all,0))::DOUBLE AS fk,
        sum(coalesce(g.fd_all,0))::DOUBLE AS fd,
        sum(CASE WHEN g.fk_all IS NOT NULL AND g.fd_all IS NOT NULL THEN g.game_rounds ELSE 0 END)::DOUBLE AS perf_rounds,
        sum(coalesce(op.op_kills,0))::DOUBLE AS op_kills,
        sum(coalesce(op.op_deaths,0))::DOUBLE AS op_deaths,
        sum(coalesce(op.km_kills,0))::DOUBLE AS km_kills,
        sum(coalesce(op.km_deaths,0))::DOUBLE AS km_deaths,
        sum(CASE WHEN op.op_kills IS NOT NULL THEN g.game_rounds ELSE 0 END)::DOUBLE AS op_rounds,
        sum(coalesce(g.adr_all,0)*g.game_rounds)::DOUBLE AS sum_adr,
        sum(CASE WHEN g.adr_all IS NOT NULL THEN g.game_rounds ELSE 0 END)::DOUBLE AS adr_rounds,
        sum(coalesce(g.kast_all,0)*g.game_rounds)::DOUBLE AS sum_kast,
        sum(CASE WHEN g.kast_all IS NOT NULL THEN g.game_rounds ELSE 0 END)::DOUBLE AS kast_rounds,
        sum(coalesce(g.hs_pct_all,0)*g.game_rounds)::DOUBLE AS sum_hs,
        sum(CASE WHEN g.hs_pct_all IS NOT NULL THEN g.game_rounds ELSE 0 END)::DOUBLE AS hs_rounds,
        sum(coalesce(g.two_k,0)+coalesce(g.three_k,0)+coalesce(g.four_k,0)+coalesce(g.five_k,0))::DOUBLE AS multi_kills,
        sum(coalesce(g.clutch_1v1,0)+coalesce(g.clutch_1v2,0)+coalesce(g.clutch_1v3,0)+coalesce(g.clutch_1v4,0)+coalesce(g.clutch_1v5,0))::DOUBLE AS clutches,
        sum(CASE WHEN g.performance_tab THEN g.game_rounds ELSE 0 END)::DOUBLE AS multi_rounds,
        sum(coalesce(g.plants,0))::DOUBLE AS plants,
        sum(coalesce(g.defuses,0))::DOUBLE AS defuses,
        sum(CASE WHEN g.performance_tab THEN g.game_rounds ELSE 0 END)::DOUBLE AS objective_rounds,
        round(sum(coalesce(g.rating_all,0)), 4)::DOUBLE AS sum_rating,
        count(g.rating_all)::DOUBLE AS n_rating,
        sum(coalesce(g.acs_all,0))::DOUBLE AS sum_acs,
        count(g.acs_all)::DOUBLE AS n_acs,
        strftime(max(g.utc_timestamp),'%Y-%m-%d') AS last_played
 FROM games g JOIN players p USING(player_id)
 LEFT JOIN operators op USING(match_id,game_id,player_id)
 GROUP BY p.player_name,p.player_id,p.country,season,g.region,agent,map,g.event,g.is_international
)
SELECT to_json(grouped) FROM grouped
