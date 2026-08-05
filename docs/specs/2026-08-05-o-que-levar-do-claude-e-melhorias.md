# Spec — opencode-honcho: o que vale trazer do plugin do Claude, e o que consertar aqui

**Data:** 2026-08-05
**Estado do repo:** `main` em `92373cb`, pacote `@rafachavantes/opencode-honcho` `0.2.0`
**Forma:** plugin TypeScript sobre `@opencode-ai/plugin` + `@honcho-ai/sdk`; `src/index.ts` com ~1.900 linhas, `src/tui.ts` com ~640, 14 arquivos de teste.
**Status:** spec de alinhamento. Não é plano executável; os gates no fim precisam ser resolvidos antes.

---

## Por que este documento existe

O pedido não é paridade de código com o `claude-honcho`. É: **o que o plugin do Claude faz hoje que valeria a pena existir aqui**, somado a **bugs e melhorias próprios deste plugin**. Portar por simetria é o erro que o rebase do Claude acabou de corrigir — três das quatro features do fork morreram porque upstream ou backend resolveram o problema por outro caminho.

## Baseline: o que o `claude-honcho` 0.2.11.1 faz hoje

| Capacidade | Origem |
|---|---|
| Injeção composável: `injection.sessionStart` (`directives`/`summary`/`peerCard`/`peerRepresentation`/`briefing`) e `injection.perTurn` (`userContext`/`assistantContext`/`sessionContext`/`dialectic`) | upstream |
| 12 ferramentas MCP (`search`, `chat`, `get_context`, `get_briefing`, `create_conclusion`, `delete_conclusion`, `honcho_remember`, …) | upstream |
| 7 skills (`briefing`, `config`, `import`, `insights`, `interview`, `setup`, `status`) | upstream |
| Escrita ao vivo; `SessionEnd` sem rede | upstream `#73`/`#88` |
| **Identidade de sessão pela raiz do repositório** — subdiretórios e worktrees numa sessão só | fork + upstream `#107` |
| **`injectOnCompact`** (`full`/`slim`/`off`) — não re-injeta o pacote cheio depois da compactação | fork |

---

## Achados neste plugin

### O que já está em dia

- **Ferramentas expostas ao modelo** — `src/index.ts:1596+` registra tools próprias: consultar settings, `status`, `set_config`, `search` de mensagens, `chat` (resposta com raciocínio) e `create_conclusion`. É o equivalente funcional das ferramentas MCP do Claude, e coloca este plugin **à frente do `honcho-codex`**, que não tem recall sob demanda nenhum. ✅
- **`contextScope`** (`global`/`session`) implementado, com a mesma nota honesta sobre `limit_to_session` ser no-op no branch de busca (`src/index.ts:528`). ✅ — ver ressalva em N1.
- **TUI própria** (`src/tui.ts`) e cache de runtime. ✅

### Bugs e riscos

**B1. Compactação não é tratada — só registrada em log.** Em `src/index.ts:1480`:

```ts
if (event.type === "session.idle" || event.type === "session.compacted") {
  await withRuntime(payload, async () => {
    await log("info", "Honcho lifecycle boundary observed.", { event: event.type, ... })
  }, undefined)
}
```

O evento `session.compacted` é observado e nada mais acontece. É exatamente o cenário que motivou o `injectOnCompact` no Claude: depois que o host compacta e gera o próprio resumo, injetar o pacote de memória outra vez reenche a janela que acabou de ser liberada, e em sessões longas isso vira um ciclo compactar → reinjetar → compactar.

Medição no Claude (05/08, peer real): `directives` 1.484 chars + `peerCard` 40 itens (~1.500) + resumo longo (~4.900) ≈ **~7.900 chars ≈ 2.000 tokens** reinjetados a cada compactação. Aqui o volume é diferente, mas o mecanismo é o mesmo — **medir antes de decidir** (gate 1).

**B2. Subdiretório vira sessão separada — por design, e o design é discutível.** O comentário em `src/index.ts:669-672` diz explicitamente que a estratégia por diretório ancora no worktree do projeto "so subdirs become distinct session labels". A resolução usa `pluginInput.directory` / `pluginInput.worktree`, nunca `git rev-parse --show-toplevel`.

Consequência prática, a mesma que apareceu no Claude: abrir em `~/repos/projeto/docs` cria memória separada de `~/repos/projeto`. No config do Rafa isso tinha gerado `rafa-docs`, `rafa-code` e várias worktrees, cada uma com um pedaço da memória do mesmo projeto — nove entradas foram removidas hoje.

Tanto o Claude (`sessionRootFor`) quanto o Codex (`_git_repo_root`) resolvem pela raiz do repo. **Este plugin é o único dos três que ainda fragmenta.**

**B3. `sessionStartDialectic: true` no default** (`src/index.ts:119`). O dialectic é a chamada mais cara do Honcho — no Claude, `chat()` leva ~12s no nível médio, e por isso ele fica **desligado** por lá e num orçamento de tempo separado. Ligado por padrão no início de toda sessão, isso é latência garantida em cada abertura. Confirmar se bloqueia ou é fire-and-forget (gate 2).

**B4. Escopo global no default injeta conclusions globais.** Com `contextScope: "global"` (o default, `src/index.ts:118`), o `session-start` chama `userPeer.context({ maxConclusions: 12, includeMostFrequent: true })` — representação global do peer, ou seja, conclusions de todos os projetos. É o vazamento entre projetos que o Claude fechou hoje com `injection.perTurn: []`.

### Gaps (o que o Claude tem e aqui falta)

**G1. Sem importação de histórico** (a skill `import` + backfill do Claude).
**G2. Sem `get_briefing`** — carregar resumo/perfil sob demanda numa chamada visível, em vez de injetar sempre.
**G3. Sem `insights`** — destilar a memória acumulada em configuração concreta.
**G4. Injeção não é composável por componente**, como o `injection.sessionStart`/`perTurn` do Claude. Aqui é `contextScope` + flags.

---

## Recomendação priorizada

1. **B2 (identidade por raiz do repositório)** — maior ganho, e o menor esforço dos três consertos. Alinha com Claude e Codex, e para de fatiar a memória do projeto. Cuidado com uma decisão explícita: se `sessionNaming: "opencode"` existe para separar sessões de propósito, isso precisa continuar possível.
2. **B1 (política pós-compactação)** — depois de medir. Se o volume reinjetado for pequeno, não vale código.
3. **B4 + B3 (defaults caros)** — dois defaults que custam tokens e latência em toda sessão. Talvez baste mudar o default, sem feature nova.
4. **G1–G4** — bons, não urgentes.

**Não portar:** `injectOnCompact` como *flag de três estados* antes de medir (B1) — pode ser que um comportamento fixo baste. E nada de `contextScope` novo: já existe aqui.

## Ressalva

**N1.** O `contextScope: session` deste plugin dropa a representação (`representation: ""`, `src/index.ts:545`) porque o backend ignorava `limit_to_session`. **Isso mudou:** `plastic-labs/honcho` `#881` (24/07) corrigiu — as vias semântica e most-derived agora recebem `session_allowlist`, e o router liga o `limit_to_session` a ela. Ainda não saiu em release (a `v3.0.12` é de 13/07, anterior ao merge), então a produção segue com o comportamento antigo. Verificado por REST em 05/08: `true` e `false` devolvem resposta idêntica.

Quando a cloud atualizar, a nota em `src/index.ts:528` fica obsoleta e o `contextScope: session` pode voltar a passar `limitToSession` e devolver conclusions de verdade. **Gatilho:** release do backend acima de `v3.0.12`.

## Gates de investigação

1. **Quanto é reinjetado depois de uma compactação neste plugin?** Medir em chars/tokens o que entra no `session-start` após `session.compacted`, do jeito que foi medido no Claude. Sem esse número, B1 é especulação.
2. **O `sessionStartDialectic` bloqueia a abertura da sessão** ou roda em segundo plano? Se bloqueia, quanto custa em segundo?
3. **O OpenCode entrega alguma dica de raiz de projeto** além de `directory`/`worktree`? Se entregar, B2 pode não precisar chamar `git`.
4. **`sessionNaming: "opencode" | "shared"` interage com B2 como?** Entender antes de mexer na identidade.
