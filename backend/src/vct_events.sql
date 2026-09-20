WITH finals AS (
 SELECT * FROM matches WHERE lower(series_round) IN ('grand final','grand finals')
 AND listing_status='Completed' AND NOT is_showmatch AND score0 != score1
 AND utc_timestamp <= current_timestamp
), placements AS (
 SELECT DISTINCT p.player_name AS player, m.event AS tournament,
 year(m.utc_timestamp)::INTEGER AS year,
 CASE WHEN m.is_international THEN 'International' ELSE 'Regional' END AS tier,
 CASE WHEN (pm.team_idx=0 AND m.score0>m.score1) OR (pm.team_idx=1 AND m.score1>m.score0) THEN 1 ELSE 2 END AS placement,
 strftime(m.utc_timestamp,'%Y-%m-%d') AS date
 FROM finals m JOIN player_map pm USING(match_id) JOIN players p USING(player_id)
)
SELECT to_json(placements) FROM placements
