-- Execute SOMENTE depois de publicar a Edge Function send-reminders.
-- 1. Habilite as extensões pg_cron, pg_net e vault no Supabase.
-- 2. Troque os valores abaixo pelos dados reais do projeto.

select vault.create_secret('https://imorefnkropyantqqkho.supabase.co', 'crm_project_url');
select vault.create_secret('COLOQUE-UM-SEGREDO-LONGO-AQUI', 'crm_cron_secret');

-- Executa a cada hora, no minuto 5.
select cron.schedule(
  'crm-followup-reminders-hourly',
  '5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='crm_project_url') || '/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='crm_cron_secret')
      ),
      body := jsonb_build_object('triggered_at', now())
    );
  $$
);
