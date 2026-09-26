do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'emailVerified')
     and not exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'email_verified') then
    alter table "user" rename column "emailVerified" to "email_verified";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'created_at') then
    alter table "user" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'updatedAt')
     and not exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'updated_at') then
    alter table "user" rename column "updatedAt" to "updated_at";
  end if;

  if not exists (select 1 from information_schema.columns where table_name = 'user' and column_name = 'plan') then
    alter table "user" add column "plan" text default 'free';
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'expiresAt')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'expires_at') then
    alter table "session" rename column "expiresAt" to "expires_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'created_at') then
    alter table "session" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'updatedAt')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'updated_at') then
    alter table "session" rename column "updatedAt" to "updated_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'ipAddress')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'ip_address') then
    alter table "session" rename column "ipAddress" to "ip_address";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'userAgent')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'user_agent') then
    alter table "session" rename column "userAgent" to "user_agent";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'userId')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'user_id') then
    alter table "session" rename column "userId" to "user_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'activeOrganizationId')
     and not exists (select 1 from information_schema.columns where table_name = 'session' and column_name = 'active_organization_id') then
    alter table "session" rename column "activeOrganizationId" to "active_organization_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'accountId')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'account_id') then
    alter table "account" rename column "accountId" to "account_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'providerId')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'provider_id') then
    alter table "account" rename column "providerId" to "provider_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'userId')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'user_id') then
    alter table "account" rename column "userId" to "user_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'accessToken')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'access_token') then
    alter table "account" rename column "accessToken" to "access_token";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'refreshToken')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'refresh_token') then
    alter table "account" rename column "refreshToken" to "refresh_token";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'idToken')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'id_token') then
    alter table "account" rename column "idToken" to "id_token";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'accessTokenExpiresAt')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'access_token_expires_at') then
    alter table "account" rename column "accessTokenExpiresAt" to "access_token_expires_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'refreshTokenExpiresAt')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'refresh_token_expires_at') then
    alter table "account" rename column "refreshTokenExpiresAt" to "refresh_token_expires_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'created_at') then
    alter table "account" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'updatedAt')
     and not exists (select 1 from information_schema.columns where table_name = 'account' and column_name = 'updated_at') then
    alter table "account" rename column "updatedAt" to "updated_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'verification' and column_name = 'expiresAt')
     and not exists (select 1 from information_schema.columns where table_name = 'verification' and column_name = 'expires_at') then
    alter table "verification" rename column "expiresAt" to "expires_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'verification' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'verification' and column_name = 'created_at') then
    alter table "verification" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'verification' and column_name = 'updatedAt')
     and not exists (select 1 from information_schema.columns where table_name = 'verification' and column_name = 'updated_at') then
    alter table "verification" rename column "updatedAt" to "updated_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'organization' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'organization' and column_name = 'created_at') then
    alter table "organization" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'member' and column_name = 'organizationId')
     and not exists (select 1 from information_schema.columns where table_name = 'member' and column_name = 'organization_id') then
    alter table "member" rename column "organizationId" to "organization_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'member' and column_name = 'userId')
     and not exists (select 1 from information_schema.columns where table_name = 'member' and column_name = 'user_id') then
    alter table "member" rename column "userId" to "user_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'member' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'member' and column_name = 'created_at') then
    alter table "member" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'organizationId')
     and not exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'organization_id') then
    alter table "invitation" rename column "organizationId" to "organization_id";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'expiresAt')
     and not exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'expires_at') then
    alter table "invitation" rename column "expiresAt" to "expires_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'createdAt')
     and not exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'created_at') then
    alter table "invitation" rename column "createdAt" to "created_at";
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'inviterId')
     and not exists (select 1 from information_schema.columns where table_name = 'invitation' and column_name = 'inviter_id') then
    alter table "invitation" rename column "inviterId" to "inviter_id";
  end if;
end $$;
