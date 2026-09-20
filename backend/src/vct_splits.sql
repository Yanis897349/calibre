WITH operators AS (
  SELECT match_id, game_id, row_player_id AS player_id,
         SUM(op_kills)::DOUBLE AS op_kills
  FROM kill_matrix GROUP BY ALL
), grouped AS (
 SELECT p.player_name AS player, p.player_id::UBIGINT AS player_id, coalesce(p.country,'') AS country,
        year(m.utc_timestamp)::INTEGER AS season, CASE WHEN m.is_international THEN 'International' ELSE coalesce(m.region,'Unknown') END AS region,
        lower(coalesce(pm.agents[1],'unknown')) AS agent,
        m.event AS tournament, CASE WHEN m.is_international THEN 'International' ELSE 'Regional' END AS tier,
        count(*)::DOUBLE AS maps,
        sum(mp.score0+mp.score1)::DOUBLE AS rounds,
        sum(coalesce(pm.kills_all,0))::DOUBLE AS kills,
        sum(coalesce(pm.assists_all,0))::DOUBLE AS assists,
        sum(coalesce(pm.fk_all,0))::DOUBLE AS fk,
        sum(coalesce(pm.fd_all,0))::DOUBLE AS fd,
        sum(CASE WHEN pm.fk_all IS NOT NULL AND pm.fd_all IS NOT NULL THEN mp.score0+mp.score1 ELSE 0 END)::DOUBLE AS perf_rounds,
        sum(coalesce(op.op_kills,0))::DOUBLE AS op_kills,
        sum(CASE WHEN op.op_kills IS NOT NULL THEN mp.score0+mp.score1 ELSE 0 END)::DOUBLE AS op_rounds,
        sum(coalesce(pm.rating_all,0))::DOUBLE AS sum_rating,
        count(pm.rating_all)::DOUBLE AS n_rating,
        sum(coalesce(pm.acs_all,0))::DOUBLE AS sum_acs,
        count(pm.acs_all)::DOUBLE AS n_acs,
        strftime(max(m.utc_timestamp),'%Y-%m-%d') AS last_played
 FROM player_map pm JOIN players p USING(player_id)
 JOIN matches m USING(match_id) JOIN maps mp USING(match_id,game_id)
 LEFT JOIN operators op USING(match_id,game_id,player_id)
 WHERE m.listing_status='Completed' AND NOT m.is_showmatch
       AND mp.score0 IS NOT NULL AND mp.score1 IS NOT NULL
       AND m.utc_timestamp <= current_timestamp
 GROUP BY p.player_name,p.player_id,p.country,season,m.region,agent,m.event,m.is_international
)
SELECT to_json(grouped) FROM grouped
