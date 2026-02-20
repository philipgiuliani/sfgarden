-- Square Foot Garden schema with RLS

-- Gardens
create table gardens (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size text not null, -- e.g. "4x4", "3x6"
  notes text,
  created_at timestamptz not null default now()
);

alter table gardens enable row level security;

create policy "Users can manage their own gardens"
  on gardens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Plantings
create table plantings (
  id text primary key,
  garden_id text not null references gardens(id) on delete cascade,
  square integer not null,
  plant_name text not null,
  variety text,
  count integer not null default 1,
  planted_at date not null default current_date,
  status text not null default 'active' check (status in ('active', 'harvested', 'failed')),
  notes text,
  created_at timestamptz not null default now()
);

alter table plantings enable row level security;

create policy "Users can manage plantings in their gardens"
  on plantings for all
  using (exists (select 1 from gardens where gardens.id = plantings.garden_id and gardens.user_id = auth.uid()))
  with check (exists (select 1 from gardens where gardens.id = plantings.garden_id and gardens.user_id = auth.uid()));

-- Harvests
create table harvests (
  id text primary key,
  planting_id text not null references plantings(id) on delete cascade,
  harvested_at date not null default current_date,
  amount text,
  weight_grams numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table harvests enable row level security;

create policy "Users can manage harvests for their plantings"
  on harvests for all
  using (exists (
    select 1 from plantings
    join gardens on gardens.id = plantings.garden_id
    where plantings.id = harvests.planting_id and gardens.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from plantings
    join gardens on gardens.id = plantings.garden_id
    where plantings.id = harvests.planting_id and gardens.user_id = auth.uid()
  ));

-- Seedlings
create table seedlings (
  id text primary key,
  garden_id text not null references gardens(id) on delete cascade,
  plant_name text not null,
  variety text,
  count integer not null default 1,
  phase text not null default 'sown' check (phase in ('sown', 'germinated', 'true_leaves', 'hardening', 'transplanted', 'failed')),
  sown_at date not null default current_date,
  phase_changed_at date not null default current_date,
  planting_id text references plantings(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

alter table seedlings enable row level security;

create policy "Users can manage seedlings in their gardens"
  on seedlings for all
  using (exists (select 1 from gardens where gardens.id = seedlings.garden_id and gardens.user_id = auth.uid()))
  with check (exists (select 1 from gardens where gardens.id = seedlings.garden_id and gardens.user_id = auth.uid()));

-- Notes
create table notes (
  id text primary key,
  garden_id text not null references gardens(id) on delete cascade,
  category text not null check (category in ('observation', 'task', 'plan', 'issue', 'general')),
  square integer,
  planting_id text references plantings(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table notes enable row level security;

create policy "Users can manage notes in their gardens"
  on notes for all
  using (exists (select 1 from gardens where gardens.id = notes.garden_id and gardens.user_id = auth.uid()))
  with check (exists (select 1 from gardens where gardens.id = notes.garden_id and gardens.user_id = auth.uid()));
