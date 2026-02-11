# Context
Swarm: local

## Decisions
- 1:1 adaptation: Follow opencode-swarm patterns exactly, only changing names and prompts
- .newsroom/ state dir: Mirrors .swarm/ but for writing context
- humanizer agent: NEW agent with no swarm analog, reviews for AI-detectable patterns
- Heterogeneous models: writer=claude-sonnet-4-5, copy_editor=gpt-4o, humanizer=gpt-4o, researcher/sme/fact_checker/managing_editor=gemini-flash
- Plugin naming: opencode-newsroom everywhere swarm appears

## Architecture (from opencode-swarm analysis)
- Plugin entry: exports Plugin async function, returns hooks/agents/tools/config
- Agents: each file exports createXAgent(model, customPrompt?, appendPrompt?) → AgentDefinition
- AgentDefinition: { name, description, config: { model, temperature, prompt, tools? } }
- Agent registry: createAgents() and getAgentConfigs() in agents/index.ts
- Config: Zod schemas, loader merges user + project configs, constants define names/models
- State: module-scoped singleton (swarmState → newsroomState) with Maps for sessions/tracking
- Hooks: safeHook wrapper, composeHandlers for chaining, each hook is a factory function
- Commands: factory creates handler, switch on subcommand, each returns string
- Plan: plan.json (structured) + plan.md (derived markdown), migration from legacy md
- Evidence: per-task bundles in evidence/{taskId}/evidence.json, atomic writes
- Guardrails: circuit breaker with soft warning + hard block, per-agent profiles
- CLI: bin script for install/uninstall, modifies opencode config.json
- Utils: SwarmError → NewsroomError base class, logger with debug flag
- Path validation: validateSwarmPath → validateNewsroomPath for directory traversal prevention

## Naming Map
- SwarmError → NewsroomError
- swarmState → newsroomState
- validateSwarmPath → validateNewsroomPath
- readSwarmFileAsync → readNewsroomFileAsync
- .swarm/ → .newsroom/
- opencode-swarm → opencode-newsroom
- OPENCODE_SWARM_DEBUG → OPENCODE_NEWSROOM_DEBUG

## File Map
Source reference: C:\opencode\opencode-swarm\src\
Target: C:\opencode\opencode-newsroom\src\

## SME Cache
(none yet)

## Patterns
- Agent factory pattern: createXAgent(model, customPrompt?, appendPrompt?) → AgentDefinition
- Hook factory pattern: createXHook(config, directory?) → hook object/function
- Command handler pattern: handleXCommand(directory, args) → Promise<string>
- Atomic writes: temp file + rename for plan.json and evidence.json
- Config merge: user config < project config, deep merge for nested objects

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 1464 | 1464 | 0 | 7ms |
| bash | 490 | 490 | 0 | 1553ms |
| edit | 390 | 390 | 0 | 475ms |
| glob | 229 | 229 | 0 | 7240ms |
| task | 189 | 189 | 0 | 163440ms |
| write | 177 | 177 | 0 | 288ms |
| todowrite | 110 | 110 | 0 | 4ms |
| grep | 105 | 105 | 0 | 84ms |
| apply_patch | 54 | 54 | 0 | 42ms |
| memory_set | 4 | 4 | 0 | 4ms |
| detect_domains | 1 | 1 | 0 | 1ms |
