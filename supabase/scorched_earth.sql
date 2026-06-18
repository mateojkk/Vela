-- SCORCHED EARTH — wipes every user, prediction, chat, and leaderboard record.
-- IRREVERSIBLE. Run this only if you are OK with everyone starting from zero.
--
-- Steps:
-- 1. Paste this into the Supabase SQL Editor.
-- 2. Run it.
-- 3. Tell users to reconnect their wallets and complete onboarding again.
--
-- Walrus Memory blobs are on-chain and immutable; this script cannot delete them.

begin;

truncate table chat_messages;
truncate table chat_sessions;
truncate table predictions;
truncate table leaderboard;
truncate table users;

-- Prevent the same wallet/username from being claimed twice in the future,
-- regardless of casing.
create unique index if not exists idx_users_email_lower on users(lower(email));
create unique index if not exists idx_users_username_lower on users(lower(username));

commit;
