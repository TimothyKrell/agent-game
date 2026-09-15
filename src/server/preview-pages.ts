import { authProviders } from './auth';
import { previewEnabled } from './preview-config';
import { randomSecret } from './http';

interface Continuation {
  requestId?: string;
  arena?: string;
  commit?: string;
  providers?: string[];
  local?: boolean;
}

function page(title: string, content: string, script: string, configuration: Continuation): Response {
  const nonce = randomSecret();

  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>${title}</title><body><main><h1>${title}</h1>${content}<p id="status" role="status"></p></main>
    <script type="application/json" id="config">${JSON.stringify(configuration).replaceAll('<', '\\u003c')}</script>
    <script nonce="${nonce}">
    const config = JSON.parse(document.getElementById('config').textContent);
    const status = document.getElementById('status');
    async function post(path, body) {
      const response = await fetch(path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body), redirect:'error'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || result.message || 'Sign-in could not be completed.');
      return result;
    }
    function failed(error) { status.textContent = error.message; }
    ${script}
    </script></body></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
      },
    },
  );
}

/** Small handoff pages keep social callbacks on the source, and codes out of request URLs/referrers. */
export async function previewPage(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);

  if (previewEnabled(env) && url.pathname === '/preview') {
    return page(
      'Sign in to this preview',
      '<p>Continue with your usual Agent Game account.</p><button id="start">Continue to source sign-in</button> <button id="restart">Start a new sign-in</button>',
      `
      function secret() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
      document.getElementById('start').onclick = async () => {
        try {
          let pending = JSON.parse(sessionStorage.getItem('preview-start') || 'null');
          if (!pending) { pending = {requestId:crypto.randomUUID(), browserProof:secret()}; sessionStorage.setItem('preview-start', JSON.stringify(pending)); }
          const result = await post('/api/preview/owner-start', pending);
          location.assign(result.continueUrl);
        } catch (error) { failed(error); }
      };
      document.getElementById('restart').onclick = () => {
        sessionStorage.removeItem('preview-start'); sessionStorage.removeItem('preview-completion');
        document.getElementById('start').click();
      };
    `,
      {},
    );
  }

  if (previewEnabled(env) && url.pathname === '/preview/return') {
    return page(
      'Complete preview sign-in',
      '<button id="complete">Complete sign-in</button>',
      `
      const fragment = new URLSearchParams(location.hash.slice(1));
      if (fragment.has('code')) {
        sessionStorage.setItem('preview-completion', JSON.stringify({requestId:fragment.get('requestId'), code:fragment.get('code')}));
        history.replaceState(null, '', location.pathname);
      }
      document.getElementById('complete').onclick = async () => {
        try {
          const pending = JSON.parse(sessionStorage.getItem('preview-completion') || 'null');
          if (!pending) throw new Error('Start sign-in from this preview first.');
          await post('/api/auth/preview/complete', pending);
          sessionStorage.removeItem('preview-completion'); sessionStorage.removeItem('preview-start');
          status.textContent = 'Signed in. Your existing owner profile and competitors are available in this preview.';
          const link = document.createElement('a'); link.href = '/'; link.textContent = 'Open preview'; status.after(link);
        } catch (error) { failed(error); }
      };
    `,
      {},
    );
  }

  if (!previewEnabled(env) && url.pathname === '/preview/continue') {
    const requestId = url.searchParams.get('requestId') ?? '';

    const handoff = await env.DB.prepare(
      `SELECT arena,commit_id FROM preview_handoffs WHERE id=? AND scope='owner' AND expires_at>?`,
    )
      .bind(requestId, Date.now())
      .first<{ arena: string; commit_id: string }>();

    if (!handoff)
      return new Response('Preview request expired. Restart sign-in from the preview.', { status: 410 });

    return page(
      'Continue to your preview',
      '<p id="target"></p><section id="providers"></section><button id="continue">Authorize preview</button>',
      `
      document.getElementById('target').textContent = config.arena + ' · revision ' + config.commit;
      for (const provider of config.providers) {
        const button = document.createElement('button'); button.textContent = 'Sign in with ' + provider;
        button.onclick = async () => { try {
          const result = await post('/api/auth/sign-in/social', {provider, callbackURL:location.href});
          location.assign(result.url);
        } catch (error) { failed(error); } };
        document.getElementById('providers').append(button);
      }
      if (config.local) {
        const button = document.createElement('button'); button.textContent = 'Local test sign-in';
        button.onclick = () => post('/api/dev/login', {name:'Preview Journey Owner'}).then(() => {status.textContent='Signed in locally.';}).catch(failed);
        document.getElementById('providers').append(button);
      }
      document.getElementById('continue').onclick = async () => { try {
        const result = await post('/api/preview/owner-handoffs', {requestId:config.requestId});
        location.assign(result.returnUrl);
      } catch (error) { failed(error); } };
    `,
      {
        requestId,
        arena: handoff.arena,
        commit: handoff.commit_id,
        providers: authProviders(env),
        local: env.ENVIRONMENT === 'development',
      },
    );
  }

  return null;
}
