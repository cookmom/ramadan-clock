-- Supabase SQL: Run this in the SQL Editor after creating a project

-- Sessions table
create table clock_sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  visitor_hash text not null,         -- hashed fingerprint (no PII)
  city text,
  country text,
  lat_round numeric(4,1),            -- rounded to ~11km (privacy)
  lon_round numeric(4,1),
  device_type text,                   -- mobile/tablet/desktop
  screen_w int,
  screen_h int,
  os text,
  browser text,
  dial text,                          -- tennis/white/salmon/etc
  numerals text,                      -- arabic/western
  is_ramadan boolean default false,
  duration_s int default 0,           -- updated on unload
  session_date date default current_date
);

-- Heartbeat updates (duration tracking)
create table session_updates (
  session_id uuid references clock_sessions(id),
  updated_at timestamptz default now(),
  duration_s int,
  dial text
);

-- Indexes
create index idx_sessions_date on clock_sessions(session_date);
create index idx_sessions_city on clock_sessions(city);
create index idx_sessions_visitor on clock_sessions(visitor_hash);
create index idx_sessions_country on clock_sessions(country);

-- Views for dashboard
create view daily_stats as
select
  session_date,
  count(*) as sessions,
  count(distinct visitor_hash) as unique_visitors,
  count(*) filter (where is_ramadan) as ramadan_sessions,
  round(avg(duration_s)) as avg_duration_s
from clock_sessions
group by session_date
order by session_date desc;

create view city_hotspots as
select
  city, country,
  count(*) as sessions,
  count(distinct visitor_hash) as unique_visitors
from clock_sessions
where city is not null
group by city, country
order by sessions desc
limit 50;

create view dial_popularity as
select
  dial,
  count(*) as uses,
  round(100.0 * count(*) / sum(count(*)) over(), 1) as pct
from clock_sessions
group by dial
order by uses desc;

create view repeat_users as
select
  visitor_hash,
  count(*) as total_sessions,
  count(distinct session_date) as days_active,
  min(session_date) as first_seen,
  max(session_date) as last_seen
from clock_sessions
group by visitor_hash
having count(*) > 1
order by total_sessions desc;

-- RLS: enable row level security but allow anon inserts
alter table clock_sessions enable row level security;
alter table session_updates enable row level security;

create policy "Allow anon insert" on clock_sessions for insert with check (true);
create policy "Allow anon insert" on session_updates for insert with check (true);
-- Read access only for authenticated (your dashboard)
create policy "Auth read" on clock_sessions for select using (auth.role() = 'authenticated');
create policy "Auth read" on session_updates for select using (auth.role() = 'authenticated');
