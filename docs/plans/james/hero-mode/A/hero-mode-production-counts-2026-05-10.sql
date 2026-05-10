SELECT COUNT(*) AS hero_state_rows
FROM child_game_state
WHERE system_id = 'hero-mode';

SELECT event_type, COUNT(*) AS count
FROM event_log
WHERE system_id = 'hero-mode'
GROUP BY event_type
ORDER BY event_type;
