# OAuth for Providers

At the moment I'm just asking for API keys, which is fine, except that if you're using a subscription you might not get an API key, but instead be expected to authenticate with **supported harnesses** using OAuth.
So, I'd like to be able to mediate that process for a user.

## OpenAI

### Codex CLI

```
https://auth.openai.com/oauth/authorize
  ?response_type=code
  &client_id=app_EMoamEEZ73f0CkXaXp7hrann
  &redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback
  &scope=openid%20profile%20email%20offline_access
  &code_challenge=1OEj05bQs1xDoMkPfqIbL2-gy5hfAB4rZ7WWQYADTWI
  &code_challenge_method=S256
  &id_token_add_organizations=true
  &codex_cli_simplified_flow=true
  &state=MJ4yndO-uTe_ge7t7_AgN0oq1o4oMLmCcSO977L1BbY
  &originator=codex_cli_rs
```

This looks like the PKCE OAuth flow + OpenID Connect, so nothing too crazy. The redirect is to `http://localhost:1455/auth/callback`, and the originator is `codex_cli_rs`.

#### Device Mode

The Codex CLI has a "device mode" login flow activated with `codex login --device-flow`. It asks the user to follow a link to an OpenAI page and then enter a specific code presented to them in the terminal. This requires the user to have enabled some toggle in the security settings of their account, so it doesn't seem like the best idea to use.

### OpenCode

```
https://auth.openai.com/oauth/authorize
  ?response_type=code
  &client_id=app_EMoamEEZ73f0CkXaXp7hrann
  &redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback
  &scope=openid+profile+email+offline_access
  &code_challenge=AbYeBsBkPMtNXXVB3N0kSIDYnxtZxii-bl9ImqbvFes
  &code_challenge_method=S256
  &id_token_add_organizations=true
  &codex_cli_simplified_flow=true
  &state=LroGLUTD82wX6mN3186x-YqJZfvoeubN0SVhcaKHgVw
  &originator=opencode
```

Interestingly, it's the same port and client ID, so OpenCode is mimicking the Codex CLI here and using their Client ID, but they are setting the `originator` parameter, so OpenAI mustn't be too nasty about other harnesses making use of these subscriptions, though not being able to configure it via environment variables is a little annoying.


## Anthropic

### Claude Code

`claude setup-token` output:
```
https://claude.ai/oauth/authorize?code=true
  &client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
  &response_type=code
  &redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback
  &scope=user%3Ainference
  &code_challenge=2H52bY5TzSgRh3fHtHshZsgGcjEyC5ufHtZz8h4uHuc
  &code_challenge_method=S256
  &state=0wobf1U3PPZQgUG5TX0QYlgKml3QJG4IkaI4g8pZD0A
```

`claude auth login` output:
```
https://claude.ai/oauth/authorize
  ?code=true
  &client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
  &response_type=code
  &redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback
  &scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference+user%3Asessions%3Aclaude_code+user%3Amcp_servers
  &code_challenge=ZSEtFaBHB1R0G8v5igI7tEBkg8YdSKGWiPr44HKaGU0
  &code_challenge_method=S256
  &state=WbDqzpLxFwS3-a3TcMIIpKAvEK3-GdHeyqZbmaZqTQE
```

We see the same client id being used, but the scopes are very different for the regular auth login, adding on a handful of extra scopes beyond just 'user inference'. The `state` params also look different, but from generating a few these seem fully random, and not structured, but always 43 characters long.

### OpenCode

```
https://claude.ai/oauth/authorize
  ?code=true
  &client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
  &response_type=code
  &redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback
  &scope=org%3Acreate_api_key+user%3Aprofile+user%3Ainference
  &code_challenge=S_X5YJVFEBfauzaSe4W9s60Blb3qo8Xm_Hrx1fHTFK8
  &code_challenge_method=S256
  &state=7S2qwBKBTkf2CRS1-R16IN0fdiiw5O4CEvGKs9OsVVUOIsqRBCkWdw8bbNMFPWa57FpgxAj1yEO3NCkbGJFa8w
```

The difference in scopes and state parameter length are interesting, these seem like they'd be dead giveaways that I was logging in to OpenCode.

Same deal, OpenCode is using the same Client Id as the primary provider. The redirect is different though.
