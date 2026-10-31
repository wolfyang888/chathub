# Proposal: local-first multi-web-AI conversation agent

## Decision

Fork **[ChatHub](https://github.com/chathub-dev/chathub)** and add a small “Portable Conversation” layer, packaged as an unpacked Chrome/Edge extension for private use. This is the lowest-change path that meets the central requirement: use the AI providers’ normal, signed-in web applications instead of their paid developer APIs.

ChatHub is an established GPL-3.0 browser extension that already supports web-app connections for ChatGPT, Gemini, DeepSeek and other bots, concurrent chat, locally saved history, import/export, and a prompt library. It provides the extension shell, multi-provider UI and much of the web-adapter pattern already needed. Doubao will need one additional adapter.

The recommended MVP uses **user-confirmed send**: the extension opens/reuses a selected provider tab and fills the prompt/context; the user reviews it and clicks Send. This avoids fragile unattended automation, accidental disclosure, and many anti-bot problems. Opt-in auto-send/capture can be evaluated later.

## Requirement fit

| Requirement | Proposed behavior |
| --- | --- |
| Website models | The user signs in to each website in Chrome/Edge. Site adapters operate only in that browser tab; no provider API key is used. |
| Change models without losing context | One canonical conversation is kept in local IndexedDB. A compact context packet is sent when continuing in another site. |
| No API-token cost | The extension makes no API calls. Provider web-plan limits, account requirements, rate limits, and any paid web subscription still apply. No API cost is not unlimited or zero-cost inference. |
| Small code change | Reuse ChatHub’s Manifest V3/React/TypeScript structure and web-app adapters; add Doubao plus the portable-thread store/transfer UI. |
| Agent behavior | MVP is a multi-model conversation coordinator, not an autonomous computer-control agent. It must not bypass captchas, quotas, login, or provider controls. |
| Plugin support | Support MCP natively, and provide reviewed compatibility adapters for DeepSeek Harness, Claude Code, and OpenAI/Codex plugin packages. Vendor plugin files are not directly interchangeable. |

## Alternatives assessed

[Open WebUI](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/) and LibreChat are good multi-model products, but their hosted-provider path calls provider API endpoints and requires API credentials. They work if we change the requirement to APIs or local models such as Ollama; they are not the right base for browser-chat access without API billing.

[OpenBrowser](https://github.com/1129Aliasgar/OpenBrowser) is a useful secondary reference: it bridges a browser AI tab to a local CLI without API keys. Its focus is a coding-agent CLI and filesystem diffs, not a shared multi-provider chat archive, so it needs more product work than ChatHub for this request.

[GenAI Prompt Extension](https://github.com/dliedke/GenAIPromptExtension) is a small MIT reference that opens/reuses ChatGPT, Gemini and DeepSeek tabs and sends a common prompt. It has only short prompt history and no response capture or portable conversation model, so it is a reference rather than the primary base.

## Base-project comparison: DeepSeek Harness vs. ChatHub

For the stated priorities, **start from ChatHub**. DeepSeek Harness is the
better base only if the primary product changes to a local coding/automation
agent with first-class plugin execution, and browser websites become a later,
separate integration.

| Criterion for this project | ChatHub | DeepSeek Harness (DSH) | Better base |
| --- | --- | --- | --- |
| Use ChatGPT/Gemini/DeepSeek web pages without an API key | Existing web-app extension adapters and Chrome/Edge UI. Doubao is one new adapter. | Would need a new browser extension/bridge and site adapters from scratch. Its normal model-routing architecture is not a replacement for the providers’ web UIs. | ChatHub |
| Keep one conversation while switching website models | Local history, import/export, and multi-bot UI are already present; add the portable-thread model. | Has a strong session/context system, but cross-provider web-chat transfer still needs the same browser layer plus new mapping logic. | ChatHub |
| No API-token billing | Naturally fits: it operates through logged-in web tabs. | Not an out-of-the-box fit. Harness model execution and routing normally need configured model access; web-session bridging is an additional feature. | ChatHub |
| DeepSeek Harness plugins | Needs a bridge adapter to an existing DSH runtime. | Native strength: plugins are central to DSH and cover tools, memory, UI, and model features. | DSH |
| Claude Code / OpenAI-Codex plugin compatibility | Both need manifest import adapters and an MCP gateway; ChatHub needs a local companion process. | Also needs adapters; DSH’s plugin runtime is not automatically compatible with Claude/Codex package formats. | Tie |
| Local tools, shell, workspace changes, approvals | Requires the optional native companion and a permission system. | Mature agent-harness concepts: tool execution, worker sandbox, permissions, sessions, workspace service, and plugins. | DSH |
| Minimum code change / fastest MVP | Add portable IndexedDB thread storage, transfer UI, and Doubao selector. | Build the entire browser-web adapter layer, local persistence UX, and plugin compatibility layer around DSH. | ChatHub |
| Ongoing maintenance risk | Provider DOM selectors can break, but this risk exists in either choice. | Must maintain both DSH integration and all website selectors, so it has more moving parts. | ChatHub |

**Practical scoring for this requirement:** ChatHub 5/5 for web-model access,
context transfer, and no-API workflow; DSH 5/5 for plugin-native agent
execution. Since the first three are the stated core requirements and “code
less changed” matters, ChatHub is the better starting point.

### Recommended evolution

```text
MVP: ChatHub fork + portable local conversation + Doubao adapter
                 │
                 ├─ MCP native companion (shared tool standard)
                 └─ optional DSH bridge for users who install DeepSeek Harness
                    └─ DSH owns its own plugins, workspace tools, and sandbox
```

Do not embed DeepSeek Harness inside the browser extension in the first
version. Treat it as an optional local execution backend. This retains the
small, browser-first MVP while allowing DSH’s plugin ecosystem when a task
needs local tools. If full coding-agent autonomy later becomes the primary
goal, it is reasonable to create a DSH-first edition; it should be a separate
project or product mode, not a rewrite of the web-chat MVP.

## Architecture

```text
Chrome/Edge extension (local only)
├─ Side panel / popup: threads, model selector, transfer review
├─ IndexedDB: canonical threads, messages, provider mappings
├─ Background worker: opens/reuses tabs and sends approved packets
├─ Plugin gateway (optional localhost native host)
│  ├─ MCP tools — native protocol
│  ├─ Claude Code / OpenAI-Codex package import adapters
│  └─ DeepSeek Harness bridge adapter
└─ Content-script adapters
   ├─ chatgpt.com
   ├─ gemini.google.com/app
   ├─ chat.deepseek.com
   └─ www.doubao.com/chat
      └─ locate composer, populate draft, optionally observe rendered reply
```

The canonical record is independent from every provider’s own conversation ID. When switching A → B, create a bounded, editable packet:

```text
You are continuing a user-owned cross-model conversation.
Conversation summary: …
Recent messages:
USER: …
ASSISTANT (Model A): …
USER: …
Answer the final user message. Do not claim you saw anything not included.
```

Use the latest 6–10 turns by default, with a user-editable summary and hard size limit. The target site receives a new chat or an explicitly selected existing chat; it cannot inherit hidden provider memory, files, custom instructions, or tool state.

## Plugin and harness requirement

The project will support plugins through a **capability gateway**, not by
executing every vendor plugin directly in the browser. This distinction is
important: DeepSeek Harness, Claude Code, and OpenAI/Codex have different
package manifests, lifecycle behavior, permissions, and runtime assumptions.
There is no safe universal “load any plugin” button.

| Plugin family | Support level | Approach |
| --- | --- | --- |
| MCP servers | Native / preferred | The companion gateway starts user-approved MCP servers and exposes a normalized, permissioned tool catalog to portable threads. This is the cross-vendor foundation. |
| OpenAI/Codex plugins | Import compatible assets | Read `.codex-plugin/plugin.json`, skills, and declared MCP configuration. Import skills as prompt/workflow templates; route MCP entries through the gateway. Do not run hooks automatically. |
| Claude Code plugins | Import compatible assets | Import reusable skill/instruction files and declared MCP servers into the same normalized catalog. Claude-specific agents, commands, and hooks require an explicit adapter and user approval. |
| DeepSeek Harness plugins | Bridge adapter | Let an installed DeepSeek Harness runtime own its plugin lifecycle. The agent sends an approved job/context to its bridge and records results in the portable thread. Do not execute an arbitrary DSH plugin inside the extension. |

OpenAI/Codex plugins can package skills and MCP configuration in a
`.codex-plugin/plugin.json` manifest; this maps cleanly to the proposed skill
importer and MCP gateway. DeepSeek Harness documents a separate `dsh plugin`
installation/runtime. Claude Code also has its own plugin lifecycle. These
formats should therefore be treated as adapters around a common capability
model, rather than as a single plugin binary format.

### Plugin execution flow

```text
Installed plugin / MCP server / Harness plugin
          │ manifest is inspected and permissions shown
          ▼
Local companion gateway (Native Messaging; localhost only)
          │ normalized tool + skill catalog
          ▼
Portable thread: user approves tool invocation and data scope
          │ result is saved as a local tool message
          ▼
Selected website model receives only the approved result in its context packet
```

The browser extension alone cannot safely run shell commands, filesystem
operations, or arbitrary MCP/plugin code. Those capabilities require an
optional local companion process installed by the user, communicating via
Chrome Native Messaging. The companion must bind to localhost only, require a
per-install secret, and expose no unauthenticated HTTP service.

## Implementation plan

### Phase 0 — fork and audit (1–2 days)

1. Fork upstream ChatHub; record the upstream commit and retain GPL-3.0 notices. A distributed modified extension must remain GPL-3.0-compatible and publish corresponding source.
2. Build and load the unchanged extension in a separate Chrome profile.
3. Verify existing web-app adapters using personal test accounts; do not use API credentials.

Exit: the fork builds and existing functions remain unchanged.

### Phase 1 — portable conversation MVP (3–5 days)

1. Add `PortableThread`, `PortableMessage`, and `ProviderBinding` records in IndexedDB.
2. Add a side-panel thread list, JSON export/import, delete-thread and clear-all-data controls.
3. Add **Continue with…**: build the bounded packet, open the provider page, and fill its composer as a draft.
4. Implement the Doubao adapter using stable accessibility attributes or DOM roles where available; avoid undocumented internal HTTP endpoints.
5. Require the user to click Send on every provider tab.

Exit: a text-only conversation moves ChatGPT → Gemini → DeepSeek → Doubao without manual copy/paste and survives browser restart.

### Phase 2 — response capture and comparison (2–4 days)

1. Add visible **Save latest reply**; capture only rendered assistant text after the user confirms completion.
2. Store provider, timestamp, available site conversation URL/ID, and content hash with the reply.
3. Add **Ask selected models**: create separate drafts in selected tabs and show saved replies side-by-side; do not auto-submit.
4. Add diagnostics: composer found, page changed, and re-login required.

### Phase 2.5 — plugin gateway MVP (4–6 days)

1. Add the optional local companion process and Chrome Native Messaging
   connection; no remote backend.
2. Implement MCP tool discovery/invocation with per-tool permission prompts,
   timeouts, output-size caps, audit log, and explicit workspace allowlist.
3. Implement a read-only OpenAI/Codex package importer for skills and declared
   MCP configuration.
4. Implement a read-only Claude Code package importer for reusable skills and
   MCP declarations.
5. Add a DeepSeek Harness bridge that delegates installation and execution to
   an existing DSH installation, with the same approval/audit flow.

Exit: a user can invoke one approved MCP tool from a portable thread and pass
its saved result to any selected website model; compatible skills from each
package family are visible as reusable workflows.

### Phase 3 — opt-in automation (later)

Only after per-site testing and policy review, offer auto-send/completion detection behind a per-site setting. Stop on login, consent, CAPTCHA, usage limit, safety warning, or unknown layout. Never implement CAPTCHA solving, credential handling, quota evasion, or private/undocumented provider APIs.

## Minimal fork changes

| Area | Change |
| --- | --- |
| Provider framework | Keep it; register `doubao` with the existing adapter interface. |
| UI | Add Portable Conversations and a Continue-with picker. |
| Persistence | Add a small IndexedDB repository; do not replace existing ChatHub history initially. |
| Transfer | New context-packet builder with turn limit, redaction warning, and preview. |
| Plugins | Optional native companion, MCP gateway, and manifest import adapters; no arbitrary browser-side plugin execution. |
| Permissions | Limit host permissions to the four selected sites initially; request more only with a new adapter. |
| Backend | None: no cloud database, API proxy, or token store. |

## Privacy, safety, and reliability

- A page adapter can access text in enabled AI tabs. It must not read or transmit cookies, authentication headers, passwords, payment details, or unrelated browsing data.
- Browser storage is local but not automatic encryption. For sensitive work, offer opt-in encrypted export with a user-supplied passphrase; never hard-code a key.
- Switching providers copies selected context to the target provider. Show the exact transfer preview and warn on first transfer to each provider. Redact secrets, personal data, and proprietary code.
- Website DOMs change frequently. Keep selectors isolated per adapter and fail closed: if the composer is not confidently found, leave the draft unsent and show an error.
- Every provider’s Terms, acceptable-use rules, and free-tier limits apply. Login, CAPTCHA, and limits remain user-controlled. This proposal does not promise a way around them.
- Plugins are code and may access local data or execute commands. Install only
  trusted, pinned versions; display requested capabilities before enablement;
  require user approval for filesystem, shell, network, or credential access.

## Acceptance tests

1. With four signed-in tabs, create a local thread and fill a ChatGPT draft.
2. Save the ChatGPT reply, continue with Gemini, and verify the transfer contains only selected/summarized local context.
3. Repeat with DeepSeek and Doubao; each reply is provider-labelled and remains after browser restart.
4. Export a thread, clear extension data, import it, and verify message order and attachment metadata.
5. Sign out of one provider: report “sign-in required” and do not work around it.
6. On an unsupported layout: leave the draft unsent and show an actionable error.
7. Install one trusted MCP server and verify its invocation requires explicit
   approval, its output is audited locally, and only that output reaches the
   selected website model.
8. Import a test Codex, Claude Code, and DeepSeek Harness plugin package;
   verify unsupported hooks/commands are marked unsupported rather than run.

## Recommendation and next decision

Start with the ChatHub fork and Phase 1 in manual-send mode. It best balances code reuse, local context ownership, and no API billing. Before implementation, decide whether this is **private/internal** or publicly distributed, because that affects GPL-3.0 release obligations. Confirm also that text-only portable context is enough for MVP; file transfer should be a later phase because providers differ in upload limits and privacy implications.

## Sources checked

- [ChatHub repository](https://github.com/chathub-dev/chathub): GPL-3.0, browser-extension architecture, web-app provider support, local history, and import/export.
- [OpenBrowser repository](https://github.com/1129Aliasgar/OpenBrowser): local browser-session bridge without API keys.
- [GenAI Prompt Extension repository](https://github.com/dliedke/GenAIPromptExtension): MIT reference for multi-site tab reuse and prompt insertion.
- [Open WebUI provider documentation](https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/): hosted-model connections need an endpoint and API key.
- [OpenAI/Codex plugin packaging](https://developers.openai.com/api/docs/guides/agents-api/tools/plugins): plugins can package skills and MCP configuration.
- [DeepSeek Harness plugins](https://deepseekdocs.com/en/docs/user-guide/plugins): DSH has its own plugin install/runtime model.
- [Claude plugin guidance](https://support.claude.com/en/articles/13837440-use-plugins-in-claude): Claude uses its own plugin lifecycle.
