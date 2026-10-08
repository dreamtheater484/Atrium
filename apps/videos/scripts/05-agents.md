---
id: agents
title: Architecture-aware AI coding
audience: Engineers and architects
---

## intro
> title: Architecture-aware AI coding | for engineers and architects

AI coding assistants are fast, but they don't know your architecture. They pick libraries your
organisation has retired, call services that are being phased out, and quietly make your
documentation wrong. Atrium fixes that.

## connect
> shot: agent-connect

Connect an assistant from the app. Choose your tool, decide what it may see, and copy one
command. For Claude Code, Cursor, VS Code or any tool that speaks the Model Context Protocol.

## loop
> diagram: agent-loop

From then on the assistant can ask Atrium questions while it works. What is this service, what
does it depend on, who uses it, which standards apply, and what would break if I change it.

## context
> agent: context

Here, the assistant is about to change the payment gateway. It asks for the service context,
and gets the purpose, owners, dependencies, consumers and the standards that apply, in a form it
can use straight away.

## check
> agent: check

Before choosing a library, it checks its plan against your standards. Java 8 is past end of
life and on hold, so the assistant changes course before writing a single line.

## propose
> agent: propose

When the code changes the architecture, the assistant proposes an update to the model: a new
dependency, an upgraded runtime. Nothing changes yet.

## approve
> shot: review

An architect sees the suggestion with a clear before and after, and the agent's reasons. One
click approves it, and the map is current again.

## security
> diagram: security

This is built to be safe. Each connection has its own token that you can revoke at any time. It
only sees information up to the level you choose, enforced twice, including by the database
itself. Agents can only suggest, never change. Everything they return is marked as data, not
instructions, and every request is logged.

## close
> end: Agents that follow your architecture, and keep it current.

Your architecture becomes context for every assistant, and every assistant helps keep it
current. Safely, and under your control.
