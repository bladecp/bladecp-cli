# Authentication

The CLI talks to the BladeCP Customer API with an API key. Keys start with
`bcp_live_`. There are four ways to provide one.

| Method | When to use it |
|---|---|
| `bladecp login` | Your own computer. Opens the Hub in your browser; you authorize the BladeCP CLI and the terminal receives a key. |
| `bladecp login --no-browser` | The browser did not open. The CLI prints the address so you can open it yourself on the same computer. |
| `bladecp login --token <key>` | You already have a key from the Hub. Use `--token -` to read it from stdin so it stays out of your shell history. |
| `BLADECP_API_KEY=<key>` | Scripts, CI and remote servers. Nothing is saved; every command uses the variable. |

## Browser sign-in

`bladecp login`:

1. starts a one-time receiver on `127.0.0.1`, on a random port;
2. opens `https://hub.bladecp.com/connect` in your browser with a PKCE (S256)
   challenge and a random `state`;
3. waits up to 5 minutes while you sign in to the Hub and authorize the CLI;
4. accepts only the answer that carries the same `state` (any other request
   to the receiver gets an error page and is ignored, so it cannot cancel the
   sign-in), exchanges the one-time code for a key and saves it.

On a terminal the screen shows the BladeCP B, the address (clickable where the
terminal supports links) and the time left. While it waits, Enter opens the
browser again, `c` copies the address and Esc cancels.

The CLI prints the account email and, when BladeCP sets one, the key's expiry
date. If you cancel in the browser, nothing is saved.

The browser must run on the same computer as the CLI, because the Hub sends the
answer to `127.0.0.1`. On a remote server over SSH, create a key at
<https://hub.bladecp.com/account/api-keys> and use one of the methods below.

## Sign in with an existing key

```sh
bladecp login --token -          # paste the key, then Ctrl+D (Ctrl+Z, Enter on Windows)
printf '%s' "$KEY" | bladecp login --token -
```

The CLI checks the key with the API before saving it.

## Use a key without saving it

```sh
export BLADECP_API_KEY=bcp_live_...
bladecp whoami
```

`BLADECP_API_KEY` always wins over a saved sign-in. While it is set,
`bladecp login` without `--token` saves nothing and only confirms which account
the key belongs to.

## Where the key is saved

`config.json` in the CLI folder: `~/.config/bladecp` on macOS and Linux
(`$XDG_CONFIG_HOME/bladecp` when that variable is set), `%APPDATA%\bladecp` on
Windows, or `BLADECP_CONFIG_DIR` when set. The file is written atomically and
is readable only by you (mode `0600`, folder `0700` on macOS and Linux).

A saved sign-in belongs to the API address it was created for. With another
`--api-url` or `BLADECP_API_URL`, the CLI reports that you are not signed in
for that address instead of sending the key elsewhere.

## Check and remove the sign-in

```sh
bladecp whoami     # account, key ID, scopes, rate limit, expiry and API address
bladecp logout     # removes the saved key from this computer
```

`bladecp logout` does not revoke the key (the Customer API has no route for a
key to revoke itself). Revoke it, or create a new one, at
<https://hub.bladecp.com/account/api-keys>. If `BLADECP_API_KEY` is still set,
`logout` warns that commands will keep using it.

The CLI keeps one saved sign-in. Signing in to another account or API address
replaces it, and the CLI says which sign-in was replaced.

## How the key is protected

- It is sent only to the API address in use, in the `Authorization` header,
  over HTTPS. Plain HTTP is refused except for `localhost`, `127.0.0.1` and
  `::1`.
- It never appears in output, errors, `--json` documents or upload progress
  files.
- The browser sign-in uses PKCE (S256) and a random `state`, so an answer
  started by someone else is ignored.

## Sign-in problems

| Error code | What to do |
|---|---|
| `not_signed_in` | Run `bladecp login`, or set `BLADECP_API_KEY`. |
| `unauthorized`, `api_key_expired` | The key expired or was revoked. Run `bladecp login` again. |
| `api_key_cap_reached` | Revoke a key you no longer use at the API keys page, then sign in again. |
| `insufficient_scope`, `key_bound_to_migration` | The key cannot run this command. Run `bladecp login` to get a new key. |
| `environment_mismatch` | The key was created for another API address. Check `--api-url`. |
| `invalid_key_format` | The value is not a BladeCP API key. Copy it again from the Hub. |
| `login_timeout`, `invalid_grant`, `invalid_callback` | Run `bladecp login` again. |
| `state_mismatch` | The wait timed out after an answer that this terminal did not start reached the receiver (another program or an old browser tab). Run `bladecp login` again. |
| `access_denied` | You cancelled in the browser. Nothing was saved. |

See [troubleshooting](troubleshooting.md) for more.
