(() => {
  const cfg = window.CRM_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) return;

  const recoveryClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY
  );
  const redirectUrl = 'https://erilopesmkt-ops.github.io/gestao-propostas-erineide/reset-password.html';
  let changing = false;

  function showMessage(message, isError = false) {
    const el = document.getElementById('authMsg');
    if (el) {
      el.textContent = message;
      el.style.color = isError ? '#b42318' : '#146c43';
    } else {
      alert(message);
    }
  }

  async function sendReset() {
    const email = (document.getElementById('loginEmail')?.value || '').trim();
    if (!email) {
      showMessage('Digite seu e-mail no campo acima e clique novamente em “Esqueci a senha”.', true);
      document.getElementById('loginEmail')?.focus();
      return;
    }

    showMessage('Enviando o link de recuperação…');
    const { error } = await recoveryClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    if (error) {
      showMessage('Não consegui enviar o e-mail agora: ' + error.message, true);
      return;
    }
    showMessage('Pronto. Verifique seu e-mail e também a pasta de spam. Abra o link recebido para definir uma nova senha.');
  }

  async function changePassword() {
    if (changing) return;
    changing = true;

    const first = prompt('Digite sua nova senha (mínimo de 6 caracteres):');
    if (!first) { changing = false; return; }
    if (first.length < 6) {
      alert('A senha precisa ter pelo menos 6 caracteres.');
      changing = false;
      return;
    }
    const second = prompt('Digite novamente a nova senha:');
    if (first !== second) {
      alert('As senhas não coincidem. Abra novamente o link de recuperação e tente outra vez.');
      changing = false;
      return;
    }

    const { error } = await recoveryClient.auth.updateUser({ password: first });
    if (error) {
      alert('Não foi possível alterar a senha: ' + error.message);
      changing = false;
      return;
    }

    alert('Senha alterada com sucesso. Você já pode entrar no CRM.');
    history.replaceState({}, document.title, redirectUrl);
    changing = false;
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('#resetBtn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendReset();
  }, true);

  recoveryClient.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(changePassword, 150);
    }
  });
})();