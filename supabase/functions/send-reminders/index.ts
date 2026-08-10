import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const REMINDER_FROM_EMAIL = Deno.env.get('REMINDER_FROM_EMAIL') || ''
const META_WHATSAPP_TOKEN = Deno.env.get('META_WHATSAPP_TOKEN') || ''
const META_PHONE_NUMBER_ID = Deno.env.get('META_PHONE_NUMBER_ID') || ''
const META_GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') || ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function brl(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function proposalValue(p: any) {
  return Number(p.negotiated_value ?? p.proposed_value ?? 0)
}

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY || !REMINDER_FROM_EMAIL) throw new Error('Credenciais de e-mail não configuradas')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: REMINDER_FROM_EMAIL, to: [to], subject, text: body })
  })
  if (!response.ok) throw new Error(`E-mail: ${response.status} ${await response.text()}`)
}

async function sendWhatsApp(to: string, body: string) {
  if (!META_WHATSAPP_TOKEN || !META_PHONE_NUMBER_ID || !META_GRAPH_VERSION) throw new Error('Credenciais do WhatsApp Cloud API não configuradas')
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } })
  })
  if (!response.ok) throw new Error(`WhatsApp: ${response.status} ${await response.text()}`)
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date().toISOString()
  const { data: reminders, error } = await supabase
    .from('followup_reminders')
    .select('id,user_id,proposal_id,remind_at,status,proposals(*)')
    .eq('status', 'pending')
    .lte('remind_at', now)
    .order('remind_at', { ascending: true })
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const results: any[] = []
  for (const reminder of reminders || []) {
    const p: any = Array.isArray(reminder.proposals) ? reminder.proposals[0] : reminder.proposals
    if (!p || ['Fechado', 'Perdido'].includes(p.status)) {
      await supabase.from('followup_reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
      continue
    }

    const { data: settings } = await supabase.from('user_settings').select('*').eq('user_id', reminder.user_id).maybeSingle()
    const text = `Lembrete de follow-up\n\nCliente: ${p.client}\nProjeto: ${p.topic}\nStatus: ${p.status}\nPróxima ação: ${p.next_action || 'não informada'}\nValor: ${brl(proposalValue(p))}`
    const subject = `Follow-up: ${p.client} — ${p.topic}`
    const errors: string[] = []
    let sent = 0

    if (settings?.email_reminders_enabled && settings?.reminder_email) {
      try { await sendEmail(settings.reminder_email, subject, text); sent++ } catch (e) { errors.push(String(e)) }
    }
    if (settings?.whatsapp_reminders_enabled && settings?.reminder_whatsapp) {
      try { await sendWhatsApp(settings.reminder_whatsapp, text); sent++ } catch (e) { errors.push(String(e)) }
    }

    const status = sent > 0 ? 'sent' : (errors.length ? 'failed' : 'sent')
    await supabase.from('followup_reminders').update({ status, sent_at: sent > 0 ? new Date().toISOString() : null, last_error: errors.length ? errors.join(' | ') : null }).eq('id', reminder.id)
    await supabase.from('interactions').insert({ user_id: reminder.user_id, proposal_id: reminder.proposal_id, channel: 'Interno', direction: 'Interno', summary: sent > 0 ? `Lembrete automático processado (${sent} canal(is)).` : 'Lembrete automático processado sem canal externo habilitado.', outcome: errors.length ? errors.join(' | ') : null })
    results.push({ reminder_id: reminder.id, sent, errors })
  }

  return Response.json({ processed: results.length, results })
})
