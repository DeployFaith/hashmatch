# Heist Scenario Presets

## warehouse_breakin

Easy difficulty. 5-8 rooms. 1 guard, 1 camera, 1 terminal.
Theme: Corporate warehouse infiltration.

## prison_escape

Medium difficulty. 8-12 rooms. 2 guards, 2 cameras, 2 terminals.
Theme: Prison facility escape.

## museum_night

Hard difficulty. 10-15 rooms. 3 guards, 3 cameras, 3 terminals.
Theme: After-hours museum heist.

## Regenerating

hm scenario gen --game heist --preset warehouse_breakin --seed 3 --out scenarios/heist/ --validate
Commit message: "Add curated Heist presets with determinism + validation smoke tests"
