-- Seedlings are not planted in a garden — they live in trays.
-- Move ownership from garden_id to user_id so seedlings exist at the user
-- level and only gain a garden association when transplanted (via planting_id).

-- Add user_id column (nullable initially so we can back-fill)
alter table seedlings add column user_id uuid references auth.users(id) on delete cascade;

-- Back-fill from the linked garden
update seedlings
set user_id = gardens.user_id
from gardens
where seedlings.garden_id = gardens.id;

-- Make it required
alter table seedlings alter column user_id set not null;

-- Drop the old RLS policy (references garden_id, must happen before column drop)
drop policy "Users can manage seedlings in their gardens" on seedlings;

-- Drop the now-redundant garden_id
alter table seedlings drop column garden_id;

create policy "Users can manage their own seedlings"
  on seedlings for all
  using (auth.uid() = user_id);
