-- Sections step 3: one spelling per material.
--
-- The rule (Heinrich, 16 Sep 2026): a material is stored as its short
-- name if it has one on the Material Types list, otherwise its full name.
-- This rewrites what was stored the other way. Data only: no table,
-- column or rule changes. Safe to run twice: a second run finds nothing.
-- Paste PART 1, run, then PART 2, run. Practice first, then live.
--
-- Left alone on purpose: CNC bar lines (their own materials list), old
-- purchase orders (history), stock item names, and fastener lines (the
-- fastener step converts them). The tube section aliases hold no material.

-- ============ PART 1 ============
update public.master_factor_items set short_name = 'Galv'
where list_name = 'grades' and lower(trim(name)) = 'galvanised' and coalesce(short_name, '') = '';

do $do$
declare m record;
begin
  for m in
    select trim(name) as full_name, trim(short_name) as short_name
    from public.master_factor_items
    where list_name = 'grades' and coalesce(trim(short_name), '') <> ''
  loop
    -- Whole-value columns: full name, or the short name in other capitals.
    update public.stock_items set grade = m.short_name
    where main_cat not in ('cncBar', 'fasteners') and grade <> m.short_name
      and lower(trim(grade)) in (lower(m.full_name), lower(m.short_name));
    update public.master_factor_items set grade = m.short_name
    where list_name = 'sections' and grade <> m.short_name
      and lower(trim(grade)) in (lower(m.full_name), lower(m.short_name));
    update public.requisitions set item_grade = m.short_name
    where item_grade <> m.short_name
      and lower(trim(item_grade)) in (lower(m.full_name), lower(m.short_name));
    update public.job_cut_items set grade = m.short_name
    where grade <> m.short_name
      and lower(trim(grade)) in (lower(m.full_name), lower(m.short_name));
    -- Laser programs end with the material: "3mm Stainless 304".
    update public.laser_programs
    set material = left(trim(material), length(trim(material)) - length(m.full_name)) || m.short_name
    where lower(trim(material)) like '% ' || lower(m.full_name);
    update public.laser_programs
    set material = left(trim(material), length(trim(material)) - length(m.short_name)) || m.short_name
    where lower(trim(material)) like '% ' || lower(m.short_name)
      and right(trim(material), length(m.short_name)) <> m.short_name;
  end loop;
end $do$;

-- ============ PART 2 ============
-- "MS" is not on the list; Mild Steel has no short name, so it is written in full.
update public.job_cut_items set grade = 'Mild Steel' where lower(trim(grade)) = 'ms';

update public.laser_programs
set material = left(trim(material), length(trim(material)) - 2) || 'Mild Steel'
where trim(material) ~* ' ms$';

-- Heinrich, 16 Sep: the channel program with no material is mild steel,
-- like the other three of that channel.
update public.laser_programs set material = '80x42x6 Channel BPW Mild Steel'
where trim(material) = '80x42x6 Channel BPW';
